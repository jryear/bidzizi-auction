// A small user-agent reader for the Devices panel: browser, version, OS, device class and in-app browsers.
// Pure and dependency-free (tests/v1/compat-logic.mjs). Good enough to group devices; never used to decide behaviour.

export type Device = { browser: string; browserVersion: string; os: string; osVersion: string; deviceClass: "phone" | "tablet" | "desktop" | ""; inApp: string };

const v = (ua: string, re: RegExp) => (ua.match(re)?.[1] ?? "").replace(/_/g, ".").split(".").slice(0, 2).join(".");

export function readUserAgent(ua: string): Device {
  const s = ua.slice(0, 600);
  // In-app browsers: the link was opened inside another app's web view.
  const inApp = /FBAN|FBAV|FB_IAB|FBIOS/.test(s) ? "Facebook" : /Instagram/.test(s) ? "Instagram" : /LinkedInApp/.test(s) ? "LinkedIn"
    : /Gmail/i.test(s) ? "Gmail" : /\bGSA\//.test(s) ? "Google app" : /Line\//.test(s) ? "LINE" : /MicroMessenger/.test(s) ? "WeChat"
    : /Twitter|TwitterAndroid/.test(s) ? "X" : /; wv\)/.test(s) ? "Android app" : "";

  let os = "", osVersion = "";
  if (/iPhone|iPod/.test(s)) { os = "iOS"; osVersion = v(s, /OS (\d+[_.]\d+)/); }
  else if (/iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s))) { os = "iPadOS"; osVersion = v(s, /OS (\d+[_.]\d+)/) || v(s, /Version\/(\d+\.\d+)/); }
  else if (/Android/.test(s)) { os = "Android"; osVersion = v(s, /Android (\d+(?:\.\d+)?)/); }
  else if (/Windows NT/.test(s)) { os = "Windows"; osVersion = v(s, /Windows NT (\d+\.\d+)/); }
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Mac OS X/.test(s)) { os = "macOS"; osVersion = v(s, /Mac OS X (\d+[_.]\d+)/); }
  else if (/Linux/.test(s)) os = "Linux";

  let browser = "", browserVersion = "";
  const pick = (name: string, re: RegExp) => { if (!browser && re.test(s)) { browser = name; browserVersion = v(s, re); } };
  pick("Samsung Internet", /SamsungBrowser\/(\d+(?:\.\d+)?)/);
  pick("Edge", /(?:EdgA|EdgiOS|Edg)\/(\d+(?:\.\d+)?)/);
  pick("Opera", /(?:OPR|OPT)\/(\d+(?:\.\d+)?)/);
  pick("Firefox", /(?:FxiOS|Firefox)\/(\d+(?:\.\d+)?)/);
  pick("Chrome", /CriOS\/(\d+(?:\.\d+)?)/);
  if (!browser && /Chrome\/(\d+)/.test(s) && !/; wv\)/.test(s)) { browser = "Chrome"; browserVersion = v(s, /Chrome\/(\d+(?:\.\d+)?)/); }
  if (!browser && /; wv\)/.test(s)) { browser = "Android WebView"; browserVersion = v(s, /Chrome\/(\d+(?:\.\d+)?)/); }
  if (!browser && /Safari\//.test(s) && /Version\/(\d+)/.test(s)) { browser = "Safari"; browserVersion = v(s, /Version\/(\d+(?:\.\d+)?)/); }
  // iOS in-app views have no Version/ token: their engine is the system WebKit, versioned with iOS.
  if (!browser && (os === "iOS" || os === "iPadOS") && /AppleWebKit/.test(s)) { browser = "iOS WebView"; browserVersion = osVersion; }

  const deviceClass = os === "iPadOS" || (/Android/.test(s) && !/Mobile/.test(s)) || /Tablet/.test(s) ? "tablet"
    : os === "iOS" || /Mobile|Android/.test(s) ? "phone" : os ? "desktop" : "";
  return { browser, browserVersion, os, osVersion, deviceClass, inApp };
}
