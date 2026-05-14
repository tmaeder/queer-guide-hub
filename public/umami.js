(function() {
  'use strict';

  var hostUrl = 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1';

  var trackingDisabled = function() {
    return navigator.doNotTrack === '1' || navigator.msDoNotTrack === '1';
  };

  var getBrowserInfo = function() {
    var ua = navigator.userAgent;
    var browser = 'Unknown', os = 'Unknown', device = 'desktop';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS')) os = 'iOS';
    if (/Mobi|Android/i.test(ua)) device = 'mobile';
    else if (/Tablet|iPad/i.test(ua)) device = 'tablet';
    return { browser: browser, os: os, device: device };
  };

  var track = function(name, data) {
    if (trackingDisabled()) return;
    var info = getBrowserInfo();
    var payload = {
      url: location.pathname + location.search,
      title: document.title,
      hostname: location.hostname,
      language: navigator.language,
      referrer: document.referrer,
      screen: screen.width + 'x' + screen.height,
      browser: info.browser,
      os: info.os,
      device: info.device
    };
    if (name) { payload.name = name; payload.data = data; }
    fetch(hostUrl + '/umami-analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function() {});
  };

  if (!trackingDisabled()) {
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    var onNav = function() { setTimeout(function() { track(); }, 300); };
    history.pushState = function() { origPush.apply(history, arguments); onNav(); };
    history.replaceState = function() { origReplace.apply(history, arguments); onNav(); };
    window.addEventListener('popstate', onNav);
    onNav();
  }

  window.umami = { track: track };
})();
