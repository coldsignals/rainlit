// "Switching from Discord": whether you can make an account on this Rainlit right now (sign-ups
// open, full for today, or invite only), with a way in.
(async () => {
  const box = document.getElementById('signup-status');
  let config;
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    config = await res.json();
  } catch {
    return;
  }
  if (config.setupNeeded) return;

  const line = (strong, rest) => {
    const p = document.createElement('span');
    const b = document.createElement('strong');
    b.textContent = strong;
    p.append(b, ` ${rest}`);
    return p;
  };
  const go = (text, href) => {
    const a = document.createElement('a');
    a.className = 'go';
    a.href = href;
    a.textContent = text;
    return a;
  };

  if (config.openSignups && !config.full) {
    const left = config.spotsLeft;
    const count = typeof left === 'number' && config.spotsPerDay
      ? ` ${left} of ${config.spotsPerDay} ${config.spotsPerDay === 1 ? 'spot' : 'spots'} left today.` : '';
    box.append(line('Sign-ups are open.', `Anyone can make an account.${count}`), document.createElement('br'),
      go('Make an account', '/?signup'));
  } else if (config.openSignups) {
    box.append(line('Full for today.', config.mail
      ? "Only so many people can join each day. Join the waitlist, and you'll get an invite by email as soon as there's room."
      : 'Only so many people can join each day. Come back tomorrow.'), document.createElement('br'),
      go(config.mail ? 'Join the waitlist' : 'Open Rainlit', config.mail ? '/?signup' : '/'));
  } else {
    box.append(line('Invite only, for now.', 'Making an account here needs an invite code from whoever runs it.'));
  }
  box.hidden = false;
})();
