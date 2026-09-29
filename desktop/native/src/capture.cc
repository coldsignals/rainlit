// rainlit_capture: for Rainlit's desktop app (Windows), a window's picture and one app's sound,
// for sharing in a call.
//
// - The picture: Windows Graphics Capture, the way Windows itself (and OBS, and Discord) get a
//   window's picture: smooth, a game's too, even behind other windows. (Chromium grabs a single
//   window the old way, GDI, a few frames a second.) Each frame is scaled to fit and turned into
//   NV12 on the GPU (the video processor), then read back: that's what a video encoder wants,
//   and a third of the size. Where the GPU can't, it comes as it is (BGRA).
// - The sound: Windows' process loopback, just the sound of one app (and whatever it starts),
//   in 10ms pieces of 48kHz stereo float. Windows 10 2004 and newer.
//
// Frames and sound go to JavaScript callbacks (thread-safe functions). If JavaScript falls
// behind, frames are dropped, never queued up.
//
// And for your activity ("Playing ...", "Listening to ..."): the windows that are open and their
// programs, what Windows' media controls say is playing, and where Steam keeps its games. What
// these say stays on the computer: the app only ever sends on a game's or song's name, and only
// if you've said so.

#include <unknwn.h> // (before C++/WinRT, so it can implement a classic COM interface)
#include <windows.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>
#include <inspectable.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <dwmapi.h>

#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Metadata.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Graphics.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>

#include <napi.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace wgc = winrt::Windows::Graphics::Capture;
namespace wdx = winrt::Windows::Graphics::DirectX;

static int64_t NowMicros() {
  return std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

static std::string HrText(const char* what, HRESULT hr) {
  char buf[160];
  snprintf(buf, sizeof buf, "%s failed (0x%08lx)", what, static_cast<unsigned long>(hr));
  return buf;
}

// Windows' build number (e.g. 19045), from ntdll (GetVersionEx lies without a manifest).
static DWORD WindowsBuild() {
  typedef LONG(WINAPI * RtlGetVersionFn)(OSVERSIONINFOW*);
  static DWORD build = [] {
    OSVERSIONINFOW v{};
    v.dwOSVersionInfoSize = sizeof v;
    auto fn = reinterpret_cast<RtlGetVersionFn>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlGetVersion"));
    return fn && fn(&v) == 0 ? v.dwBuildNumber : 0;
  }();
  return build;
}

// A job run on a thread of its own, in the multi-threaded COM apartment (WinRT and the audio
// APIs want one, and the JavaScript thread's COM state isn't ours to change).
template <typename F>
static void InMta(F&& job) {
  std::thread t([&] {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    job();
    winrt::uninit_apartment();
  });
  t.join();
}

// ================= The picture =================

struct VideoOut {
  std::vector<uint8_t> data;
  int w = 0, h = 0;
  bool nv12 = true;
  int64_t ts = 0;
};

class WindowCapture {
 public:
  Napi::ThreadSafeFunction onFrame, onEvent;

  ~WindowCapture() { Stop(); }

  // Starts on its own; frames go to onFrame, and "closed" (the window went away) to onEvent.
  bool Start(HWND hwnd, int maxW, int maxH, int fps, std::string& error) {
    maxW_ = std::max(2, maxW);
    maxH_ = std::max(2, maxH);
    interval_ = fps > 0 ? 1000000 / fps : 33333;
    bool ok = false;
    InMta([&] {
      try {
        ok = Setup(hwnd, error);
      } catch (winrt::hresult_error const& e) {
        error = HrText("Starting the capture", e.code());
      } catch (...) {
        error = "Starting the capture failed";
      }
    });
    if (!ok) Teardown();
    return ok;
  }

  void Stop() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (stopped_) return;
      stopped_ = true;
    }
    Teardown();
    if (onFrame) onFrame.Release();
    if (onEvent) onEvent.Release();
    onFrame = nullptr;
    onEvent = nullptr;
  }

  // (Changing what it's asked for: a smaller size or fewer frames, say.)
  void Tune(int maxW, int maxH, int fps) {
    std::lock_guard<std::mutex> lock(mutex_);
    maxW_ = std::max(2, maxW);
    maxH_ = std::max(2, maxH);
    interval_ = fps > 0 ? 1000000 / fps : 33333;
  }

 private:
  std::mutex mutex_;
  bool stopped_ = false;
  int maxW_ = 1920, maxH_ = 1080;
  int64_t interval_ = 33333;
  int64_t last_ = 0;

  winrt::com_ptr<ID3D11Device> d3d_;
  winrt::com_ptr<ID3D11DeviceContext> ctx_;
  wdx::Direct3D11::IDirect3DDevice device_{nullptr};
  wgc::GraphicsCaptureItem item_{nullptr};
  wgc::Direct3D11CaptureFramePool pool_{nullptr};
  wgc::GraphicsCaptureSession session_{nullptr};
  winrt::event_token frameToken_{}, closedToken_{};
  winrt::Windows::Graphics::SizeInt32 poolSize_{};

  // Turning frames into NV12, at the size wanted (made again when the sizes change).
  winrt::com_ptr<ID3D11VideoDevice> vdev_;
  winrt::com_ptr<ID3D11VideoContext> vctx_;
  winrt::com_ptr<ID3D11VideoProcessorEnumerator> venum_;
  winrt::com_ptr<ID3D11VideoProcessor> vproc_;
  winrt::com_ptr<ID3D11Texture2D> outTex_, staging_;
  winrt::com_ptr<ID3D11VideoProcessorOutputView> outView_;
  int inW_ = 0, inH_ = 0, outW_ = 0, outH_ = 0;
  bool useNv12_ = true;

  bool Setup(HWND hwnd, std::string& error) {
    if (!IsWindow(hwnd)) {
      error = "That window has closed";
      return false;
    }
    if (!wgc::GraphicsCaptureSession::IsSupported()) {
      error = "Window capture isn't supported on this version of Windows";
      return false;
    }
    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
    HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags, nullptr, 0, D3D11_SDK_VERSION, d3d_.put(), nullptr, ctx_.put());
    if (FAILED(hr)) {
      // (No video support on this GPU: frames come as they are.)
      useNv12_ = false;
      hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, d3d_.put(), nullptr, ctx_.put());
    }
    if (FAILED(hr)) {
      error = HrText("Creating a Direct3D device", hr);
      return false;
    }
    // (Windows' capture uses the device from its own threads too.)
    if (auto mt = d3d_.try_as<ID3D11Multithread>()) mt->SetMultithreadProtected(TRUE);
    if (useNv12_) {
      vdev_ = d3d_.try_as<ID3D11VideoDevice>();
      vctx_ = ctx_.try_as<ID3D11VideoContext>();
      if (!vdev_ || !vctx_) useNv12_ = false;
    }
    auto dxgi = d3d_.as<IDXGIDevice>();
    winrt::com_ptr<::IInspectable> inspectable;
    winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), inspectable.put()));
    device_ = inspectable.as<wdx::Direct3D11::IDirect3DDevice>();

    auto interop = winrt::get_activation_factory<wgc::GraphicsCaptureItem>().as<IGraphicsCaptureItemInterop>();
    hr = interop->CreateForWindow(hwnd, winrt::guid_of<wgc::IGraphicsCaptureItem>(), winrt::put_abi(item_));
    if (FAILED(hr) || !item_) {
      error = HrText("Capturing that window", hr);
      return false;
    }
    poolSize_ = item_.Size();
    pool_ = wgc::Direct3D11CaptureFramePool::CreateFreeThreaded(device_, wdx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, poolSize_);
    session_ = pool_.CreateCaptureSession(item_);
    using winrt::Windows::Foundation::Metadata::ApiInformation;
    if (ApiInformation::IsPropertyPresent(L"Windows.Graphics.Capture.GraphicsCaptureSession", L"IsCursorCaptureEnabled")) {
      session_.IsCursorCaptureEnabled(true);
    }
    // (Windows 11: without the yellow border Windows 10 always draws.)
    if (ApiInformation::IsPropertyPresent(L"Windows.Graphics.Capture.GraphicsCaptureSession", L"IsBorderRequired")) {
      try {
        session_.IsBorderRequired(false);
      } catch (...) {
      }
    }
    frameToken_ = pool_.FrameArrived({this, &WindowCapture::OnFrame});
    closedToken_ = item_.Closed([this](auto&&, auto&&) { Tell("closed"); });
    session_.StartCapture();
    return true;
  }

  void Teardown() {
    InMta([&] {
      try {
        if (pool_ && frameToken_.value) pool_.FrameArrived(frameToken_);
        if (item_ && closedToken_.value) item_.Closed(closedToken_);
        if (session_) session_.Close();
        if (pool_) pool_.Close();
      } catch (...) {
      }
    });
    std::lock_guard<std::mutex> lock(mutex_);
    session_ = nullptr;
    pool_ = nullptr;
    item_ = nullptr;
    device_ = nullptr;
    outView_ = nullptr;
    vproc_ = nullptr;
    venum_ = nullptr;
    outTex_ = nullptr;
    staging_ = nullptr;
  }

  void Tell(const char* what) {
    std::string* msg = new std::string(what);
    if (!onEvent || onEvent.NonBlockingCall(msg, [](Napi::Env env, Napi::Function fn, std::string* m) {
          fn.Call({Napi::String::New(env, *m)});
          delete m;
        }) != napi_ok) {
      delete msg;
    }
  }

  void OnFrame(wgc::Direct3D11CaptureFramePool const& sender, winrt::Windows::Foundation::IInspectable const&) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (stopped_) return;
    auto frame = sender.TryGetNextFrame();
    if (!frame) return;
    struct Closer {
      wgc::Direct3D11CaptureFrame& f;
      ~Closer() {
        try {
          f.Close();
        } catch (...) {
        }
      }
    } closer{frame};
    try {
      auto size = frame.ContentSize();
      // The window's size changed: the pool follows (this frame's skipped).
      if (size.Width != poolSize_.Width || size.Height != poolSize_.Height) {
        poolSize_ = size;
        pool_.Recreate(device_, wdx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, size);
        return;
      }
      int64_t now = NowMicros();
      if (now - last_ < interval_ * 9 / 10) return; // (no more than the frames a second asked for)
      if (size.Width < 2 || size.Height < 2) return;
      auto access = frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
      winrt::com_ptr<ID3D11Texture2D> tex;
      winrt::check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D), tex.put_void()));
      auto out = std::make_unique<VideoOut>();
      bool ok = useNv12_ ? ToNv12(tex.get(), size.Width, size.Height, *out) : ToBgra(tex.get(), size.Width, size.Height, *out);
      if (!ok) return;
      last_ = now;
      out->ts = now;
      VideoOut* raw = out.release();
      if (!onFrame || onFrame.NonBlockingCall(raw, [](Napi::Env env, Napi::Function fn, VideoOut* o) {
            auto buf = Napi::ArrayBuffer::New(env, o->data.size());
            std::memcpy(buf.Data(), o->data.data(), o->data.size());
            auto obj = Napi::Object::New(env);
            obj.Set("w", o->w);
            obj.Set("h", o->h);
            obj.Set("format", o->nv12 ? "NV12" : "BGRA");
            obj.Set("ts", static_cast<double>(o->ts));
            obj.Set("data", buf);
            fn.Call({obj});
            delete o;
          }) != napi_ok) {
        delete raw; // (JavaScript's behind: this one's dropped)
      }
    } catch (...) {
      // (A frame that couldn't be read: the next one will do.)
    }
  }

  // Fits w x h inside the size wanted, keeping its shape (even numbers, as NV12 needs).
  void FitOut(int w, int h, int& ow, int& oh) {
    double s = std::min({1.0, static_cast<double>(maxW_) / w, static_cast<double>(maxH_) / h});
    ow = std::max(2, static_cast<int>(w * s) & ~1);
    oh = std::max(2, static_cast<int>(h * s) & ~1);
  }

  bool ToNv12(ID3D11Texture2D* tex, int w, int h, VideoOut& out) {
    int ow, oh;
    FitOut(w, h, ow, oh);
    if (!vproc_ || w != inW_ || h != inH_ || ow != outW_ || oh != outH_) {
      if (!MakeProcessor(w, h, ow, oh)) {
        useNv12_ = false; // (then as it is, from now on)
        return ToBgra(tex, w, h, out);
      }
    }
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC ivd{};
    ivd.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    winrt::com_ptr<ID3D11VideoProcessorInputView> inView;
    if (FAILED(vdev_->CreateVideoProcessorInputView(tex, venum_.get(), &ivd, inView.put()))) return false;
    RECT src{0, 0, w, h};
    RECT dst{0, 0, ow, oh};
    vctx_->VideoProcessorSetStreamSourceRect(vproc_.get(), 0, TRUE, &src);
    vctx_->VideoProcessorSetStreamDestRect(vproc_.get(), 0, TRUE, &dst);
    vctx_->VideoProcessorSetOutputTargetRect(vproc_.get(), TRUE, &dst);
    D3D11_VIDEO_PROCESSOR_STREAM stream{};
    stream.Enable = TRUE;
    stream.pInputSurface = inView.get();
    if (FAILED(vctx_->VideoProcessorBlt(vproc_.get(), outView_.get(), 0, 1, &stream))) return false;
    ctx_->CopyResource(staging_.get(), outTex_.get());
    D3D11_MAPPED_SUBRESOURCE m{};
    if (FAILED(ctx_->Map(staging_.get(), 0, D3D11_MAP_READ, 0, &m))) return false;
    // (NV12, mapped: the Y rows, then the UV rows, each row RowPitch long.)
    out.data.resize(static_cast<size_t>(ow) * oh * 3 / 2);
    const uint8_t* s = static_cast<const uint8_t*>(m.pData);
    uint8_t* d = out.data.data();
    for (int y = 0; y < oh; y++) std::memcpy(d + static_cast<size_t>(y) * ow, s + static_cast<size_t>(y) * m.RowPitch, ow);
    const uint8_t* uv = s + static_cast<size_t>(m.RowPitch) * oh;
    uint8_t* duv = d + static_cast<size_t>(ow) * oh;
    for (int y = 0; y < oh / 2; y++) std::memcpy(duv + static_cast<size_t>(y) * ow, uv + static_cast<size_t>(y) * m.RowPitch, ow);
    ctx_->Unmap(staging_.get(), 0);
    out.w = ow;
    out.h = oh;
    out.nv12 = true;
    return true;
  }

  bool MakeProcessor(int w, int h, int ow, int oh) {
    vproc_ = nullptr;
    venum_ = nullptr;
    outView_ = nullptr;
    outTex_ = nullptr;
    staging_ = nullptr;
    inW_ = inH_ = outW_ = outH_ = 0;
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC cd{};
    cd.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    cd.InputWidth = w;
    cd.InputHeight = h;
    cd.OutputWidth = ow;
    cd.OutputHeight = oh;
    cd.Usage = D3D11_VIDEO_USAGE_PLAYBACK_NORMAL;
    if (FAILED(vdev_->CreateVideoProcessorEnumerator(&cd, venum_.put()))) return false;
    UINT support = 0;
    if (FAILED(venum_->CheckVideoProcessorFormat(DXGI_FORMAT_NV12, &support)) || !(support & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT)) return false;
    if (FAILED(vdev_->CreateVideoProcessor(venum_.get(), 0, vproc_.put()))) return false;
    D3D11_TEXTURE2D_DESC td{};
    td.Width = ow;
    td.Height = oh;
    td.MipLevels = 1;
    td.ArraySize = 1;
    td.Format = DXGI_FORMAT_NV12;
    td.SampleDesc.Count = 1;
    td.Usage = D3D11_USAGE_DEFAULT;
    td.BindFlags = D3D11_BIND_RENDER_TARGET;
    if (FAILED(d3d_->CreateTexture2D(&td, nullptr, outTex_.put()))) return false;
    td.Usage = D3D11_USAGE_STAGING;
    td.BindFlags = 0;
    td.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    if (FAILED(d3d_->CreateTexture2D(&td, nullptr, staging_.put()))) return false;
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC ovd{};
    ovd.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    if (FAILED(vdev_->CreateVideoProcessorOutputView(outTex_.get(), venum_.get(), &ovd, outView_.put()))) return false;
    // A screen's colors (full-range RGB) to video's (BT.709, limited range), as a browser expects NV12.
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE in{};
    in.RGB_Range = 0;
    in.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255;
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE outCs{};
    outCs.YCbCr_Matrix = 1;
    outCs.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235;
    vctx_->VideoProcessorSetStreamColorSpace(vproc_.get(), 0, &in);
    vctx_->VideoProcessorSetOutputColorSpace(vproc_.get(), &outCs);
    vctx_->VideoProcessorSetStreamAutoProcessingMode(vproc_.get(), 0, FALSE);
    inW_ = w;
    inH_ = h;
    outW_ = ow;
    outH_ = oh;
    return true;
  }

  // Where the GPU can't make NV12: the picture as it is (BGRA, full size).
  bool ToBgra(ID3D11Texture2D* tex, int w, int h, VideoOut& out) {
    if (!staging_ || w != inW_ || h != inH_) {
      staging_ = nullptr;
      D3D11_TEXTURE2D_DESC td{};
      td.Width = w;
      td.Height = h;
      td.MipLevels = 1;
      td.ArraySize = 1;
      td.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
      td.SampleDesc.Count = 1;
      td.Usage = D3D11_USAGE_STAGING;
      td.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
      if (FAILED(d3d_->CreateTexture2D(&td, nullptr, staging_.put()))) return false;
      inW_ = w;
      inH_ = h;
    }
    D3D11_BOX box{0, 0, 0, static_cast<UINT>(w), static_cast<UINT>(h), 1};
    ctx_->CopySubresourceRegion(staging_.get(), 0, 0, 0, 0, tex, 0, &box);
    D3D11_MAPPED_SUBRESOURCE m{};
    if (FAILED(ctx_->Map(staging_.get(), 0, D3D11_MAP_READ, 0, &m))) return false;
    out.data.resize(static_cast<size_t>(w) * h * 4);
    for (int y = 0; y < h; y++) std::memcpy(out.data.data() + static_cast<size_t>(y) * w * 4, static_cast<const uint8_t*>(m.pData) + static_cast<size_t>(y) * m.RowPitch, static_cast<size_t>(w) * 4);
    ctx_->Unmap(staging_.get(), 0);
    out.w = w;
    out.h = h;
    out.nv12 = false;
    return true;
  }
};

// ================= The sound =================

struct AudioOut {
  std::vector<float> data; // interleaved stereo
  int frames = 0;
  int64_t ts = 0;
};

// Waits for Windows to hand over the app's audio client.
struct ActivateHandler : winrt::implements<ActivateHandler, IActivateAudioInterfaceCompletionHandler> {
  HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  HRESULT hr = E_FAIL;
  winrt::com_ptr<IAudioClient> client;
  ~ActivateHandler() { CloseHandle(done); }
  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
    HRESULT result = E_FAIL;
    winrt::com_ptr<::IUnknown> unk;
    HRESULT got = op->GetActivateResult(&result, unk.put());
    hr = FAILED(got) ? got : result;
    if (SUCCEEDED(hr) && unk) client = unk.as<IAudioClient>();
    SetEvent(done);
    return S_OK;
  }
};

class AppAudioCapture {
 public:
  Napi::ThreadSafeFunction onAudio;

  ~AppAudioCapture() { Stop(); }

  bool Start(DWORD pid, std::string& error) {
    std::mutex m;
    std::condition_variable cv;
    bool ready = false, ok = false;
    running_ = true;
    thread_ = std::thread([&, pid] {
      winrt::init_apartment(winrt::apartment_type::multi_threaded);
      std::string err;
      bool started = Open(pid, err);
      {
        std::lock_guard<std::mutex> lock(m);
        ok = started;
        error = err;
        ready = true;
      }
      cv.notify_one();
      if (started) Run();
      client_ = nullptr;
      capture_ = nullptr;
      winrt::uninit_apartment();
    });
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, [&] { return ready; });
    if (!ok) {
      running_ = false;
      if (thread_.joinable()) thread_.join();
    }
    return ok;
  }

  void Stop() {
    running_ = false;
    if (event_) SetEvent(event_);
    if (thread_.joinable()) thread_.join();
    if (event_) {
      CloseHandle(event_);
      event_ = nullptr;
    }
    if (onAudio) onAudio.Release();
    onAudio = nullptr;
  }

 private:
  std::atomic<bool> running_{false};
  std::thread thread_;
  HANDLE event_ = nullptr;
  winrt::com_ptr<IAudioClient> client_;
  winrt::com_ptr<IAudioCaptureClient> capture_;
  bool isFloat_ = true;
  int channels_ = 2;

  bool Open(DWORD pid, std::string& error) {
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT pv{};
    pv.vt = VT_BLOB;
    pv.blob.cbSize = sizeof params;
    pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
    auto handler = winrt::make_self<ActivateHandler>();
    winrt::com_ptr<IActivateAudioInterfaceAsyncOperation> op;
    HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &pv, handler.get(), op.put());
    if (FAILED(hr)) {
      error = HrText("Getting that app's sound", hr);
      return false;
    }
    if (WaitForSingleObject(handler->done, 5000) != WAIT_OBJECT_0) {
      error = "Getting that app's sound took too long";
      return false;
    }
    if (FAILED(handler->hr) || !handler->client) {
      error = HrText("Getting that app's sound", handler->hr);
      return false;
    }
    client_ = handler->client;
    // 48kHz stereo float (or 16-bit, where float isn't taken).
    WAVEFORMATEX f{};
    f.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
    f.nChannels = 2;
    f.nSamplesPerSec = 48000;
    f.wBitsPerSample = 32;
    f.nBlockAlign = f.nChannels * f.wBitsPerSample / 8;
    f.nAvgBytesPerSec = f.nSamplesPerSec * f.nBlockAlign;
    DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    hr = client_->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 200000, 0, &f, nullptr);
    if (FAILED(hr)) {
      f.wFormatTag = WAVE_FORMAT_PCM;
      f.wBitsPerSample = 16;
      f.nBlockAlign = f.nChannels * f.wBitsPerSample / 8;
      f.nAvgBytesPerSec = f.nSamplesPerSec * f.nBlockAlign;
      isFloat_ = false;
      hr = client_->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 200000, 0, &f, nullptr);
    }
    if (FAILED(hr)) {
      error = HrText("Starting that app's sound", hr);
      return false;
    }
    event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (FAILED(hr = client_->SetEventHandle(event_)) || FAILED(hr = client_->GetService(__uuidof(IAudioCaptureClient), capture_.put_void())) || FAILED(hr = client_->Start())) {
      error = HrText("Starting that app's sound", hr);
      return false;
    }
    return true;
  }

  // Reads what the app plays, and sends it on in 10ms pieces. While the app's quiet (it may
  // send nothing at all), silence keeps the sound going, so it never stalls or drifts.
  void Run() {
    const int chunk = 480;
    std::vector<float> pending;
    pending.reserve(chunk * 8);
    int64_t start = NowMicros();
    int64_t sent = 0; // frames sent
    while (running_) {
      WaitForSingleObject(event_, 10);
      if (!running_) break;
      UINT32 packet = 0;
      while (SUCCEEDED(capture_->GetNextPacketSize(&packet)) && packet > 0) {
        BYTE* data = nullptr;
        UINT32 frames = 0;
        DWORD flags = 0;
        if (FAILED(capture_->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
        size_t at = pending.size();
        pending.resize(at + static_cast<size_t>(frames) * 2);
        if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) || !data) {
          std::fill(pending.begin() + at, pending.end(), 0.0f);
        } else if (isFloat_) {
          std::memcpy(pending.data() + at, data, static_cast<size_t>(frames) * 2 * sizeof(float));
        } else {
          const int16_t* s = reinterpret_cast<const int16_t*>(data);
          for (size_t i = 0; i < static_cast<size_t>(frames) * 2; i++) pending[at + i] = s[i] / 32768.0f;
        }
        capture_->ReleaseBuffer(frames);
      }
      // Behind the clock by more than 30ms with nothing played: silence, up to now.
      int64_t due = (NowMicros() - start) * 48 / 1000;
      int64_t have = sent + static_cast<int64_t>(pending.size() / 2);
      if (due - have > 1440) pending.resize(pending.size() + static_cast<size_t>(due - have) * 2, 0.0f);
      // (Too far ahead, say after a hiccup: the oldest go, rather than lag.)
      if (have - due > 9600) {
        size_t drop = static_cast<size_t>(have - due - 2400) * 2;
        pending.erase(pending.begin(), pending.begin() + std::min(drop, pending.size()));
      }
      while (pending.size() >= static_cast<size_t>(chunk) * 2) {
        auto out = new AudioOut();
        out->data.assign(pending.begin(), pending.begin() + chunk * 2);
        out->frames = chunk;
        out->ts = start + sent * 1000000 / 48000;
        pending.erase(pending.begin(), pending.begin() + chunk * 2);
        sent += chunk;
        if (!onAudio || onAudio.NonBlockingCall(out, [](Napi::Env env, Napi::Function fn, AudioOut* o) {
              auto buf = Napi::ArrayBuffer::New(env, o->data.size() * sizeof(float));
              std::memcpy(buf.Data(), o->data.data(), o->data.size() * sizeof(float));
              auto obj = Napi::Object::New(env);
              obj.Set("frames", o->frames);
              obj.Set("rate", 48000);
              obj.Set("channels", 2);
              obj.Set("ts", static_cast<double>(o->ts));
              obj.Set("data", buf);
              fn.Call({obj});
              delete o;
            }) != napi_ok) {
          delete out;
        }
      }
    }
    if (capture_) client_->Stop();
  }
};

// ================= For JavaScript =================

static std::mutex gLock;
static std::map<int, std::shared_ptr<WindowCapture>> gWindows;
static std::map<int, std::shared_ptr<AppAudioCapture>> gAudio;
static int gNext = 1;

static HWND HwndOf(const Napi::Value& v) {
  return reinterpret_cast<HWND>(static_cast<intptr_t>(v.As<Napi::Number>().Int64Value()));
}

// { window, audio, borderless, build }: what this Windows can do.
static Napi::Value Supported(const Napi::CallbackInfo& info) {
  bool window = false, borderless = false;
  InMta([&] {
    try {
      window = wgc::GraphicsCaptureSession::IsSupported();
      borderless = winrt::Windows::Foundation::Metadata::ApiInformation::IsPropertyPresent(L"Windows.Graphics.Capture.GraphicsCaptureSession", L"IsBorderRequired");
    } catch (...) {
    }
  });
  auto out = Napi::Object::New(info.Env());
  out.Set("window", window);
  out.Set("audio", WindowsBuild() >= 19041);
  out.Set("borderless", borderless);
  out.Set("build", static_cast<double>(WindowsBuild()));
  return out;
}

// The process that owns a window (its sound comes from it, or from what it started).
static Napi::Value WindowProcess(const Napi::CallbackInfo& info) {
  DWORD pid = 0;
  GetWindowThreadProcessId(HwndOf(info[0]), &pid);
  return Napi::Number::New(info.Env(), pid);
}

// startWindow({ hwnd, maxWidth, maxHeight, fps }, onFrame(frame), onEvent(name)) -> id
static Napi::Value StartWindow(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto o = info[0].As<Napi::Object>();
  auto cap = std::make_shared<WindowCapture>();
  cap->onFrame = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(), "rainlit-frame", 2, 1);
  cap->onEvent = Napi::ThreadSafeFunction::New(env, info[2].As<Napi::Function>(), "rainlit-event", 0, 1);
  std::string error;
  int maxW = o.Has("maxWidth") ? o.Get("maxWidth").As<Napi::Number>().Int32Value() : 1920;
  int maxH = o.Has("maxHeight") ? o.Get("maxHeight").As<Napi::Number>().Int32Value() : 1080;
  int fps = o.Has("fps") ? o.Get("fps").As<Napi::Number>().Int32Value() : 30;
  if (!cap->Start(HwndOf(o.Get("hwnd")), maxW, maxH, fps, error)) {
    cap->Stop();
    throw Napi::Error::New(env, error);
  }
  std::lock_guard<std::mutex> lock(gLock);
  int id = gNext++;
  gWindows[id] = cap;
  return Napi::Number::New(env, id);
}

static Napi::Value TuneWindow(const Napi::CallbackInfo& info) {
  int id = info[0].As<Napi::Number>().Int32Value();
  auto o = info[1].As<Napi::Object>();
  std::shared_ptr<WindowCapture> cap;
  {
    std::lock_guard<std::mutex> lock(gLock);
    auto it = gWindows.find(id);
    if (it != gWindows.end()) cap = it->second;
  }
  if (cap) cap->Tune(o.Get("maxWidth").As<Napi::Number>().Int32Value(), o.Get("maxHeight").As<Napi::Number>().Int32Value(), o.Get("fps").As<Napi::Number>().Int32Value());
  return info.Env().Undefined();
}

static Napi::Value StopWindow(const Napi::CallbackInfo& info) {
  int id = info[0].As<Napi::Number>().Int32Value();
  std::shared_ptr<WindowCapture> cap;
  {
    std::lock_guard<std::mutex> lock(gLock);
    auto it = gWindows.find(id);
    if (it != gWindows.end()) {
      cap = it->second;
      gWindows.erase(it);
    }
  }
  if (cap) cap->Stop();
  return info.Env().Undefined();
}

// startAudio({ pid }, onAudio(chunk)) -> id
static Napi::Value StartAudio(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto o = info[0].As<Napi::Object>();
  auto cap = std::make_shared<AppAudioCapture>();
  cap->onAudio = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(), "rainlit-audio", 8, 1);
  std::string error;
  if (!cap->Start(static_cast<DWORD>(o.Get("pid").As<Napi::Number>().Uint32Value()), error)) {
    cap->Stop();
    throw Napi::Error::New(env, error);
  }
  std::lock_guard<std::mutex> lock(gLock);
  int id = gNext++;
  gAudio[id] = cap;
  return Napi::Number::New(env, id);
}

static Napi::Value StopAudio(const Napi::CallbackInfo& info) {
  int id = info[0].As<Napi::Number>().Int32Value();
  std::shared_ptr<AppAudioCapture> cap;
  {
    std::lock_guard<std::mutex> lock(gLock);
    auto it = gAudio.find(id);
    if (it != gAudio.end()) {
      cap = it->second;
      gAudio.erase(it);
    }
  }
  if (cap) cap->Stop();
  return info.Env().Undefined();
}

// ================= What you're doing (your activity) =================

static std::string Utf8(const std::wstring& w) {
  if (w.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), s.data(), n, nullptr, nullptr);
  return s;
}

// A process's program file, in full ("C:\...\Hades.exe"), or "".
static std::wstring ProgramPath(DWORD pid) {
  HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!p) return L"";
  wchar_t buf[MAX_PATH * 2];
  DWORD n = ARRAYSIZE(buf);
  std::wstring out = QueryFullProcessImageNameW(p, 0, buf, &n) ? std::wstring(buf, n) : L"";
  CloseHandle(p);
  return out;
}

struct OpenWindow {
  std::wstring path, title;
  DWORD pid = 0;
};

// The windows you'd see on the taskbar, more or less: shown, not owned by another window, not
// a tool window, not hidden away by Windows (cloaked), and with a title.
static BOOL CALLBACK EachWindow(HWND hwnd, LPARAM lp) {
  auto* list = reinterpret_cast<std::vector<OpenWindow>*>(lp);
  if (!IsWindowVisible(hwnd) || GetWindow(hwnd, GW_OWNER)) return TRUE;
  if (GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) return TRUE;
  BOOL cloaked = FALSE;
  if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof cloaked)) && cloaked) return TRUE;
  int len = GetWindowTextLengthW(hwnd);
  if (len <= 0) return TRUE;
  std::wstring title(static_cast<size_t>(len) + 1, L'\0');
  title.resize(GetWindowTextW(hwnd, title.data(), len + 1));
  OpenWindow w;
  GetWindowThreadProcessId(hwnd, &w.pid);
  w.path = ProgramPath(w.pid);
  w.title = title;
  list->push_back(std::move(w));
  return TRUE;
}

// listWindows() -> [{ path, exe, title, pid }]
static Napi::Value ListWindows(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::vector<OpenWindow> list;
  EnumWindows(EachWindow, reinterpret_cast<LPARAM>(&list));
  auto out = Napi::Array::New(env, list.size());
  for (size_t i = 0; i < list.size(); i++) {
    const auto& w = list[i];
    size_t slash = w.path.find_last_of(L"\\/");
    auto o = Napi::Object::New(env);
    o.Set("path", Utf8(w.path));
    o.Set("exe", Utf8(slash == std::wstring::npos ? w.path : w.path.substr(slash + 1)));
    o.Set("title", Utf8(w.title));
    o.Set("pid", static_cast<double>(w.pid));
    out[static_cast<uint32_t>(i)] = o;
  }
  return out;
}

namespace wmc = winrt::Windows::Media::Control;

struct Playing {
  std::wstring app, title, artist, album;
  int status = 0;
  double position = -1, duration = -1, updated = 0; // ms (updated: since 1970)
};

// DateTime (100ns since 1601) -> ms since 1970.
static double UnixMs(winrt::Windows::Foundation::DateTime t) {
  int64_t ticks = winrt::clock::to_file_time(t).value;
  return ticks > 116444736000000000LL ? static_cast<double>((ticks - 116444736000000000LL) / 10000) : 0;
}

// mediaSessions() -> [{ app, title, artist, album, status, position, duration, updated }]: what
// each app playing sound has told Windows' media controls (status 4: playing, 5: paused).
// Windows 10 1809 and newer; [] before that.
static Napi::Value MediaSessions(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::vector<Playing> list;
  InMta([&] {
    try {
      auto manager = wmc::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
      for (auto const& s : manager.GetSessions()) {
        Playing m;
        m.app = std::wstring(s.SourceAppUserModelId());
        try {
          m.status = static_cast<int>(s.GetPlaybackInfo().PlaybackStatus());
        } catch (...) {
        }
        try {
          auto props = s.TryGetMediaPropertiesAsync().get();
          m.title = std::wstring(props.Title());
          m.artist = std::wstring(props.Artist());
          m.album = std::wstring(props.AlbumTitle());
        } catch (...) {
        }
        try {
          auto t = s.GetTimelineProperties();
          auto ms = [](winrt::Windows::Foundation::TimeSpan d) { return static_cast<double>(std::chrono::duration_cast<std::chrono::milliseconds>(d).count()); };
          if (t.EndTime() > t.StartTime()) {
            m.duration = ms(t.EndTime() - t.StartTime());
            m.position = ms(t.Position() - t.StartTime());
            m.updated = UnixMs(t.LastUpdatedTime());
          }
        } catch (...) {
        }
        list.push_back(std::move(m));
      }
    } catch (...) {
    }
  });
  auto out = Napi::Array::New(env, list.size());
  for (size_t i = 0; i < list.size(); i++) {
    const auto& m = list[i];
    auto o = Napi::Object::New(env);
    o.Set("app", Utf8(m.app));
    o.Set("title", Utf8(m.title));
    o.Set("artist", Utf8(m.artist));
    o.Set("album", Utf8(m.album));
    o.Set("status", m.status);
    o.Set("position", m.position);
    o.Set("duration", m.duration);
    o.Set("updated", m.updated);
    out[static_cast<uint32_t>(i)] = o;
  }
  return out;
}

// steam() -> { path, appId }: where Steam is installed (its games are in its libraries), and
// the game Steam says is running (0: none).
static Napi::Value Steam(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  DWORD appId = 0, size = sizeof appId;
  RegGetValueW(HKEY_CURRENT_USER, L"Software\\Valve\\Steam", L"RunningAppID", RRF_RT_REG_DWORD, nullptr, &appId, &size);
  wchar_t path[MAX_PATH * 2];
  DWORD pathSize = sizeof path;
  std::wstring steamPath;
  if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Valve\\Steam", L"SteamPath", RRF_RT_REG_SZ, nullptr, path, &pathSize) == ERROR_SUCCESS) steamPath = path;
  auto o = Napi::Object::New(env);
  o.Set("path", Utf8(steamPath));
  o.Set("appId", static_cast<double>(appId));
  return o;
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  static CO_MTA_USAGE_COOKIE keep = nullptr;
  if (!keep) CoIncrementMTAUsage(&keep);
  exports.Set("supported", Napi::Function::New(env, Supported));
  exports.Set("windowProcess", Napi::Function::New(env, WindowProcess));
  exports.Set("startWindow", Napi::Function::New(env, StartWindow));
  exports.Set("tuneWindow", Napi::Function::New(env, TuneWindow));
  exports.Set("stopWindow", Napi::Function::New(env, StopWindow));
  exports.Set("startAudio", Napi::Function::New(env, StartAudio));
  exports.Set("stopAudio", Napi::Function::New(env, StopAudio));
  exports.Set("listWindows", Napi::Function::New(env, ListWindows));
  exports.Set("mediaSessions", Napi::Function::New(env, MediaSessions));
  exports.Set("steam", Napi::Function::New(env, Steam));
  return exports;
}

NODE_API_MODULE(rainlit_capture, Init)
