'use strict';

// rainlit.app/@name: someone's homepage on its own page (drawn by homepage.js), for anyone its
// owner lets see it. People who aren't signed in only see the ones their owners made public.

(async () => {
  const H = window.Homepage;
  const page = document.getElementById('hp-page');
  const message = document.getElementById('hp-message');
  const who = decodeURIComponent(location.pathname.slice(1)); // "@name"

  let data;
  try {
    const res = await fetch(`/api/homepages/${encodeURIComponent(who)}`);
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      message.textContent = data.error || "This homepage couldn't be loaded.";
      // Not public: after signing in, the app opens it (if you're allowed to see it).
      if (data.locked) {
        const signIn = document.createElement('a');
        signIn.href = `/?homepage=${encodeURIComponent(who)}`;
        signIn.textContent = 'Open it in Rainlit';
        signIn.className = 'hp-join';
        signIn.style.cssText = 'display:inline-block;margin-top:12px;text-decoration:none';
        message.append(document.createElement('br'), signIn);
      }
      message.hidden = false;
      return;
    }
  } catch {
    message.textContent = "Can't reach Rainlit right now. Try again in a bit.";
    message.hidden = false;
    return;
  }

  const shown = H.mount(page, data);
  document.title = shown.doc.title || `${data.owner.displayName}'s homepage`;
  if (data.mine) {
    document.getElementById('hp-mine').hidden = false;
    document.getElementById('hp-join').hidden = true;
  }
  new ResizeObserver(() => shown.fit()).observe(page);
})();
