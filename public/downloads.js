// On an Android phone, show the Android app first.
if (/Android/.test(navigator.userAgent)) {
  const apps = document.querySelector('.apps');
  apps.prepend(document.getElementById('android').closest('.card'));
}
