{
  # rainlit_capture: a window's picture and one app's sound, for sharing (src/capture.cc).
  # Built for the desktop app's Electron with `npm run native` (in desktop/).
  "targets": [
    {
      "target_name": "rainlit_capture",
      "sources": ["src/capture.cc"],
      "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
      "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++20", "/permissive-", "/bigobj", "/utf-8", "/Zc:__cplusplus"]
        }
      },
      "libraries": ["d3d11.lib", "dxgi.lib", "windowsapp.lib", "mmdevapi.lib", "ole32.lib"]
    }
  ]
}
