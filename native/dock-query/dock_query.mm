#include <node_api.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

#include <algorithm>
#include <cmath>
#include <string>
#include <unordered_set>
#include <vector>
#include <unistd.h>

struct DockItem {
  std::string name;
  int x;
  int y;
};

static CFStringRef kAXFullScreenAttrCompat = CFSTR("AXFullScreen");
static CFStringRef kAXZoomedAttrCompat = CFSTR("AXZoomed");

static CFTypeRef CopyAXAttr(AXUIElementRef element, CFStringRef attr) {
  CFTypeRef value = nullptr;
  AXError err = AXUIElementCopyAttributeValue(element, attr, &value);
  if (err != kAXErrorSuccess) return nullptr;
  return value;
}

static bool GetAXPoint(AXUIElementRef element, CFStringRef attr, CGPoint* out) {
  CFTypeRef value = CopyAXAttr(element, attr);
  if (!value) return false;

  bool ok = false;
  if (CFGetTypeID(value) == AXValueGetTypeID()) {
    AXValueRef axv = (AXValueRef)value;
    if (AXValueGetType(axv) == kAXValueCGPointType) {
      ok = AXValueGetValue(axv, (AXValueType)kAXValueCGPointType, out);
    }
  }
  CFRelease(value);
  return ok;
}

static bool GetAXSize(AXUIElementRef element, CFStringRef attr, CGSize* out) {
  CFTypeRef value = CopyAXAttr(element, attr);
  if (!value) return false;

  bool ok = false;
  if (CFGetTypeID(value) == AXValueGetTypeID()) {
    AXValueRef axv = (AXValueRef)value;
    if (AXValueGetType(axv) == kAXValueCGSizeType) {
      ok = AXValueGetValue(axv, (AXValueType)kAXValueCGSizeType, out);
    }
  }
  CFRelease(value);
  return ok;
}

static bool SetAXPoint(AXUIElementRef element, CFStringRef attr, const CGPoint& p) {
  AXValueRef v = AXValueCreate((AXValueType)kAXValueCGPointType, &p);
  if (!v) return false;
  AXError err = AXUIElementSetAttributeValue(element, attr, v);
  CFRelease(v);
  return err == kAXErrorSuccess;
}

static bool SetAXSize(AXUIElementRef element, CFStringRef attr, const CGSize& s) {
  AXValueRef v = AXValueCreate((AXValueType)kAXValueCGSizeType, &s);
  if (!v) return false;
  AXError err = AXUIElementSetAttributeValue(element, attr, v);
  CFRelease(v);
  return err == kAXErrorSuccess;
}

static bool SetAXBool(AXUIElementRef element, CFStringRef attr, bool value) {
  AXError err =
      AXUIElementSetAttributeValue(element, attr, value ? kCFBooleanTrue : kCFBooleanFalse);
  return err == kAXErrorSuccess;
}

static bool GetAXBool(AXUIElementRef element, CFStringRef attr, bool* out) {
  if (!element || !out) return false;
  CFTypeRef value = CopyAXAttr(element, attr);
  if (!value) return false;
  bool ok = false;
  if (CFGetTypeID(value) == CFBooleanGetTypeID()) {
    *out = CFBooleanGetValue((CFBooleanRef)value);
    ok = true;
  }
  CFRelease(value);
  return ok;
}

static bool IsAXAttrSettable(AXUIElementRef element, CFStringRef attr) {
  if (!element) return false;
  Boolean settable = false;
  AXError err = AXUIElementIsAttributeSettable(element, attr, &settable);
  return err == kAXErrorSuccess && settable;
}

static bool IsStandardWindow(AXUIElementRef win) {
  if (!win) return false;
  CFTypeRef subrole = CopyAXAttr(win, kAXSubroleAttribute);
  bool isStandard = false;
  if (subrole && CFGetTypeID(subrole) == CFStringGetTypeID()) {
    isStandard = CFStringCompare((CFStringRef)subrole, kAXStandardWindowSubrole,
                                 0) == kCFCompareEqualTo;
  }
  if (subrole) CFRelease(subrole);
  return isStandard;
}

static bool IsUsableWindowForMoveResize(AXUIElementRef win) {
  if (!win) return false;
  bool hasPos = IsAXAttrSettable(win, kAXPositionAttribute);
  bool hasSize = IsAXAttrSettable(win, kAXSizeAttribute);
  return hasPos && hasSize;
}

static bool IsNearScalar(CGFloat a, CGFloat b, CGFloat tol) {
  return std::fabs((double)a - (double)b) <= (double)tol;
}

static bool IsNearPoint(const CGPoint& a, const CGPoint& b, CGFloat tol) {
  return IsNearScalar(a.x, b.x, tol) && IsNearScalar(a.y, b.y, tol);
}

static bool IsNearSize(const CGSize& a, const CGSize& b, CGFloat tol) {
  return IsNearScalar(a.width, b.width, tol) && IsNearScalar(a.height, b.height, tol);
}

static bool ApplyWindowBoundsPrecise(AXUIElementRef win, const CGPoint& p, const CGSize& s) {
  if (!win) return false;
  const CGFloat kTol = 2.0;
  const useconds_t kSettleUs = 12000;
  const CFStringRef kAXEnhancedUserInterfaceAttr = CFSTR("AXEnhancedUserInterface");

  AXUIElementRef appElement = nullptr;
  pid_t pid = 0;
  if (AXUIElementGetPid(win, &pid) == kAXErrorSuccess && pid > 0) {
    appElement = AXUIElementCreateApplication(pid);
  }

  bool hadEnhancedUI = false;
  bool disabledEnhancedUI = false;
  if (appElement && IsAXAttrSettable(appElement, kAXEnhancedUserInterfaceAttr)) {
    if (GetAXBool(appElement, kAXEnhancedUserInterfaceAttr, &hadEnhancedUI) && hadEnhancedUI) {
      if (SetAXBool(appElement, kAXEnhancedUserInterfaceAttr, false)) {
        disabledEnhancedUI = true;
      }
    }
  }

  // Community-proven cross-display sequence (Rectangle/Hammerspoon style).
  SetAXSize(win, kAXSizeAttribute, s);
  SetAXPoint(win, kAXPositionAttribute, p);
  SetAXSize(win, kAXSizeAttribute, s);

  usleep(kSettleUs);
  CGPoint actualP = CGPointZero;
  CGSize actualS = CGSizeZero;
  bool gotP = GetAXPoint(win, kAXPositionAttribute, &actualP);
  bool gotS = GetAXSize(win, kAXSizeAttribute, &actualS);
  bool exact = gotP && gotS && IsNearPoint(actualP, p, kTol) && IsNearSize(actualS, s, kTol);

  // One deterministic correction pass only.
  if (!exact) {
    SetAXPoint(win, kAXPositionAttribute, p);
    SetAXSize(win, kAXSizeAttribute, s);
    usleep(kSettleUs);
    gotP = GetAXPoint(win, kAXPositionAttribute, &actualP);
    gotS = GetAXSize(win, kAXSizeAttribute, &actualS);
    exact = gotP && gotS && IsNearPoint(actualP, p, kTol) && IsNearSize(actualS, s, kTol);
  }

  if (appElement) {
    if (disabledEnhancedUI && hadEnhancedUI) {
      SetAXBool(appElement, kAXEnhancedUserInterfaceAttr, true);
    }
    CFRelease(appElement);
  }
  return exact;
}

static bool NativeMaximizeOrFallback(AXUIElementRef win, const CGPoint& p, const CGSize& s) {
  if (!win) return false;
  const CGFloat kTol = 2.0;

  // Never use fullscreen for maximize behavior.
  SetAXBool(win, kAXFullScreenAttrCompat, false);

  bool usedNativeZoom = false;
  bool nativeZoomOk = false;
  if (IsAXAttrSettable(win, kAXZoomedAttrCompat)) {
    usedNativeZoom = true;
    bool alreadyZoomed = false;
    if (GetAXBool(win, kAXZoomedAttrCompat, &alreadyZoomed) && alreadyZoomed) {
      SetAXBool(win, kAXZoomedAttrCompat, false);
    }
    nativeZoomOk = SetAXBool(win, kAXZoomedAttrCompat, true);
  }

  CGPoint actualP = CGPointZero;
  CGSize actualS = CGSizeZero;
  bool gotP = GetAXPoint(win, kAXPositionAttribute, &actualP);
  bool gotS = GetAXSize(win, kAXSizeAttribute, &actualS);
  bool topLeftOk = gotP && IsNearPoint(actualP, p, kTol);
  bool sizeOk = gotS && IsNearSize(actualS, s, kTol);

  if (usedNativeZoom && nativeZoomOk && topLeftOk && sizeOk) {
    return true;
  }

  // Deterministic fallback: explicit maximize bounds anchored to top-left.
  return ApplyWindowBoundsPrecise(win, p, s);
}

static bool EnterWindowFullscreen(AXUIElementRef win) {
  if (!win) return false;
  bool isFull = false;
  if (GetAXBool(win, kAXFullScreenAttrCompat, &isFull) && isFull) {
    return true;
  }

  if (IsAXAttrSettable(win, kAXFullScreenAttrCompat) &&
      SetAXBool(win, kAXFullScreenAttrCompat, true)) {
    return true;
  }

  CFTypeRef btn = CopyAXAttr(win, kAXFullScreenButtonAttribute);
  bool ok = false;
  if (btn && CFGetTypeID(btn) == AXUIElementGetTypeID()) {
    AXError pressErr = AXUIElementPerformAction((AXUIElementRef)btn, kAXPressAction);
    ok = (pressErr == kAXErrorSuccess);
  }
  if (btn) CFRelease(btn);
  return ok;
}

static std::string GetAXString(AXUIElementRef element, CFStringRef attr) {
  CFTypeRef value = CopyAXAttr(element, attr);
  if (!value) return "";
  std::string out;
  if (CFGetTypeID(value) == CFStringGetTypeID()) {
    NSString* s = (__bridge NSString*)value;
    if (s) out = [s UTF8String] ?: "";
  }
  CFRelease(value);
  return out;
}

static AXUIElementRef CopyFocusedApplication() {
  AXUIElementRef sys = AXUIElementCreateSystemWide();
  if (sys) {
    CFTypeRef appValue = nullptr;
    AXError err =
        AXUIElementCopyAttributeValue(sys, kAXFocusedApplicationAttribute, &appValue);
    CFRelease(sys);
    if (err == kAXErrorSuccess && appValue &&
        CFGetTypeID(appValue) == AXUIElementGetTypeID()) {
      return (AXUIElementRef)appValue;  // retained
    }
    if (appValue) CFRelease(appValue);
  }

  NSRunningApplication* front = [[NSWorkspace sharedWorkspace] frontmostApplication];
  if (!front) return nullptr;
  pid_t pid = [front processIdentifier];
  if (pid <= 0) return nullptr;
  AXUIElementRef app = AXUIElementCreateApplication(pid);
  if (!app) {
    return nullptr;
  }
  return app;  // retained
}

static NSRunningApplication* FindRunningApplicationByName(const std::string& appNameUtf8) {
  if (appNameUtf8.empty()) return nil;
  NSString* target = [NSString stringWithUTF8String:appNameUtf8.c_str()];
  if (!target || [target length] == 0) return nil;

  NSArray<NSRunningApplication*>* running = [[NSWorkspace sharedWorkspace] runningApplications];
  if (!running || [running count] == 0) return nil;

  for (NSRunningApplication* app in running) {
    if (!app) continue;
    NSString* n = [app localizedName];
    if (!n) continue;
    if ([n caseInsensitiveCompare:target] == NSOrderedSame) {
      return app;
    }
  }
  return nil;
}

static AXUIElementRef CopyApplicationByName(const std::string& appNameUtf8) {
  NSRunningApplication* match = FindRunningApplicationByName(appNameUtf8);
  if (!match) return nullptr;
  pid_t pid = [match processIdentifier];
  if (pid <= 0) return nullptr;
  AXUIElementRef appRef = AXUIElementCreateApplication(pid);
  if (!appRef) return nullptr;
  return appRef;  // retained
}

static std::string FocusedApplicationName() {
  NSRunningApplication* front = [[NSWorkspace sharedWorkspace] frontmostApplication];
  if (!front) return "";
  NSString* name = [front localizedName];
  if (!name) return "";
  return [name UTF8String] ?: "";
}

static AXUIElementRef CopyFirstStandardWindow(AXUIElementRef app) {
  CFTypeRef wins = CopyAXAttr(app, kAXWindowsAttribute);
  if (!wins) return nullptr;

  AXUIElementRef out = nullptr;
  AXUIElementRef fallbackStandard = nullptr;
  AXUIElementRef fallbackAny = nullptr;
  if (CFGetTypeID(wins) == CFArrayGetTypeID()) {
    CFArrayRef arr = (CFArrayRef)wins;
    CFIndex n = CFArrayGetCount(arr);
    for (CFIndex i = 0; i < n; ++i) {
      CFTypeRef item = CFArrayGetValueAtIndex(arr, i);
      if (!item || CFGetTypeID(item) != AXUIElementGetTypeID()) continue;
      AXUIElementRef w = (AXUIElementRef)item;
      bool isStandard = IsStandardWindow(w);
      if (!isStandard) continue;

      if (!fallbackStandard) {
        fallbackStandard = w;
        CFRetain(fallbackStandard);
      }
      if (IsUsableWindowForMoveResize(w)) {
        out = w;
        CFRetain(out);
        break;
      }
    }
    if (!out && fallbackStandard) {
      out = fallbackStandard;
      fallbackStandard = nullptr;
    }
    if (!out && n > 0) {
      CFTypeRef first = CFArrayGetValueAtIndex(arr, 0);
      if (first && CFGetTypeID(first) == AXUIElementGetTypeID()) {
        fallbackAny = (AXUIElementRef)first;
        CFRetain(fallbackAny);
      }
    }
  }
  if (!out && fallbackAny) {
    out = fallbackAny;
    fallbackAny = nullptr;
  }
  if (fallbackStandard) CFRelease(fallbackStandard);
  if (fallbackAny) CFRelease(fallbackAny);
  CFRelease(wins);
  return out;
}

static AXUIElementRef CopyFocusedWindow(AXUIElementRef app) {
  if (!app) return nullptr;
  CFTypeRef value = CopyAXAttr(app, kAXFocusedWindowAttribute);
  if (value && CFGetTypeID(value) == AXUIElementGetTypeID()) {
    AXUIElementRef focused = (AXUIElementRef)value;  // retained
    if (IsStandardWindow(focused) && IsUsableWindowForMoveResize(focused)) {
      return focused;
    }
    CFRelease(focused);
    value = nullptr;
  }
  if (value) CFRelease(value);
  return CopyFirstStandardWindow(app);
}

static std::vector<AXUIElementRef> GetAXChildren(AXUIElementRef element) {
  std::vector<AXUIElementRef> out;
  CFTypeRef value = CopyAXAttr(element, kAXChildrenAttribute);
  if (!value) return out;

  if (CFGetTypeID(value) == CFArrayGetTypeID()) {
    CFArrayRef arr = (CFArrayRef)value;
    CFIndex n = CFArrayGetCount(arr);
    out.reserve((size_t)n);
    for (CFIndex i = 0; i < n; ++i) {
      AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(arr, i);
      if (child) {
        CFRetain(child);
        out.push_back(child);
      }
    }
  }
  CFRelease(value);
  return out;
}

static void CollectDockItems(AXUIElementRef element, int depth, std::vector<DockItem>* items) {
  if (depth > 6) return;
  CGPoint p = CGPointZero;
  if (GetAXPoint(element, kAXPositionAttribute, &p)) {
    std::string name = GetAXString(element, kAXTitleAttribute);
    if (name.empty()) name = GetAXString(element, kAXDescriptionAttribute);
    if (!name.empty() && name != "missing value" && name != "Dock") {
      items->push_back(DockItem{
          name,
          (int)std::lround(p.x),
          (int)std::lround(p.y),
      });
    }
  }

  auto children = GetAXChildren(element);
  for (AXUIElementRef child : children) {
    CollectDockItems(child, depth + 1, items);
    CFRelease(child);
  }
}

static napi_value MakeError(napi_env env, const char* msg) {
  napi_throw_error(env, nullptr, msg);
  napi_value v;
  napi_get_undefined(env, &v);
  return v;
}

static napi_value GetDockItems(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  NSArray<NSRunningApplication*>* apps =
      [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.dock"];
  if (!apps || [apps count] == 0) {
    return MakeError(env, "Dock is not running");
  }

  pid_t dockPid = [[apps objectAtIndex:0] processIdentifier];
  AXUIElementRef dock = AXUIElementCreateApplication(dockPid);
  if (!dock) {
    return MakeError(env, "Failed to create AX Dock handle");
  }

  std::vector<DockItem> items;
  CollectDockItems(dock, 0, &items);
  CFRelease(dock);

  std::unordered_set<std::string> seen;
  std::vector<DockItem> unique;
  unique.reserve(items.size());
  for (const auto& item : items) {
    std::string key =
        item.name + "|" + std::to_string(item.x) + "|" + std::to_string(item.y);
    if (seen.find(key) != seen.end()) continue;
    seen.insert(key);
    unique.push_back(item);
  }

  std::sort(unique.begin(), unique.end(), [](const DockItem& a, const DockItem& b) {
    if (a.x == b.x) return a.y < b.y;
    return a.x < b.x;
  });

  napi_value out;
  napi_create_array_with_length(env, unique.size(), &out);
  for (size_t i = 0; i < unique.size(); ++i) {
    napi_value itemObj;
    napi_create_object(env, &itemObj);

    napi_value nameVal;
    napi_create_string_utf8(env, unique[i].name.c_str(), NAPI_AUTO_LENGTH, &nameVal);
    napi_set_named_property(env, itemObj, "name", nameVal);

    napi_value posObj;
    napi_create_object(env, &posObj);

    napi_value xVal;
    napi_create_int32(env, unique[i].x, &xVal);
    napi_set_named_property(env, posObj, "x", xVal);

    napi_value yVal;
    napi_create_int32(env, unique[i].y, &yVal);
    napi_set_named_property(env, posObj, "y", yVal);

    napi_set_named_property(env, itemObj, "pos", posObj);
    napi_set_element(env, out, i, itemObj);
  }

  return out;
}

static napi_value GetFocusedWindowBounds(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  AXUIElementRef app = CopyFocusedApplication();
  if (!app) return MakeError(env, "Failed to access focused app");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Focused app has no window");

  CGPoint p = CGPointZero;
  CGSize s = CGSizeZero;
  bool okPos = GetAXPoint(win, kAXPositionAttribute, &p);
  bool okSize = GetAXSize(win, kAXSizeAttribute, &s);
  CFRelease(win);
  if (!okPos || !okSize) {
    return MakeError(env, "Failed to read focused window bounds");
  }

  napi_value out;
  napi_create_object(env, &out);
  napi_value xVal;
  napi_create_double(env, p.x, &xVal);
  napi_set_named_property(env, out, "x", xVal);
  napi_value yVal;
  napi_create_double(env, p.y, &yVal);
  napi_set_named_property(env, out, "y", yVal);
  napi_value wVal;
  napi_create_double(env, s.width, &wVal);
  napi_set_named_property(env, out, "w", wVal);
  napi_value hVal;
  napi_create_double(env, s.height, &hVal);
  napi_set_named_property(env, out, "h", hVal);
  return out;
}

static bool GetRequiredUtf8Property(napi_env env, napi_value obj, const char* key,
                                    std::string* out) {
  bool has = false;
  napi_has_named_property(env, obj, key, &has);
  if (!has) return false;
  napi_value v;
  napi_get_named_property(env, obj, key, &v);
  size_t len = 0;
  napi_get_value_string_utf8(env, v, nullptr, 0, &len);
  std::vector<char> buf(len + 1);
  size_t written = 0;
  napi_get_value_string_utf8(env, v, buf.data(), buf.size(), &written);
  out->assign(buf.data(), written);
  return true;
}

static napi_value GetFocusedApplicationName(napi_env env, napi_callback_info info) {
  std::string name = FocusedApplicationName();
  napi_value out;
  napi_create_string_utf8(env, name.c_str(), NAPI_AUTO_LENGTH, &out);
  return out;
}

static napi_value GetApplicationWindowBounds(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected {name}");

  std::string appName;
  if (!GetRequiredUtf8Property(env, argv[0], "name", &appName) || appName.empty()) {
    return MakeError(env, "name is required");
  }

  AXUIElementRef app = CopyApplicationByName(appName);
  if (!app) return MakeError(env, "Application process not found");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Application has no window");

  CGPoint p = CGPointZero;
  CGSize s = CGSizeZero;
  bool okPos = GetAXPoint(win, kAXPositionAttribute, &p);
  bool okSize = GetAXSize(win, kAXSizeAttribute, &s);
  CFRelease(win);
  if (!okPos || !okSize) {
    return MakeError(env, "Failed to read application window bounds");
  }

  napi_value out;
  napi_create_object(env, &out);
  napi_value xVal;
  napi_create_double(env, p.x, &xVal);
  napi_set_named_property(env, out, "x", xVal);
  napi_value yVal;
  napi_create_double(env, p.y, &yVal);
  napi_set_named_property(env, out, "y", yVal);
  napi_value wVal;
  napi_create_double(env, s.width, &wVal);
  napi_set_named_property(env, out, "w", wVal);
  napi_value hVal;
  napi_create_double(env, s.height, &hVal);
  napi_set_named_property(env, out, "h", hVal);
  return out;
}

static napi_value MoveFocusedWindow(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected bounds object");

  napi_value xV, yV, wV, hV;
  bool has = false;
  napi_has_named_property(env, argv[0], "x", &has);
  if (!has) return MakeError(env, "bounds.x is required");
  napi_get_named_property(env, argv[0], "x", &xV);
  napi_has_named_property(env, argv[0], "y", &has);
  if (!has) return MakeError(env, "bounds.y is required");
  napi_get_named_property(env, argv[0], "y", &yV);
  napi_has_named_property(env, argv[0], "w", &has);
  if (!has) return MakeError(env, "bounds.w is required");
  napi_get_named_property(env, argv[0], "w", &wV);
  napi_has_named_property(env, argv[0], "h", &has);
  if (!has) return MakeError(env, "bounds.h is required");
  napi_get_named_property(env, argv[0], "h", &hV);

  double x = 0, y = 0, w = 0, h = 0;
  napi_get_value_double(env, xV, &x);
  napi_get_value_double(env, yV, &y);
  napi_get_value_double(env, wV, &w);
  napi_get_value_double(env, hV, &h);
  if (!(w > 0) || !(h > 0)) return MakeError(env, "bounds.w/h must be > 0");

  AXUIElementRef app = CopyFocusedApplication();
  if (!app) return MakeError(env, "Failed to access focused app");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Focused app has no window");

  // Ensure fullscreen state does not block explicit bounds changes.
  if (IsAXAttrSettable(win, kAXFullScreenAttrCompat)) {
    SetAXBool(win, kAXFullScreenAttrCompat, false);
  }
  // Only de-zoom when the attribute exists and is currently enabled.
  if (IsAXAttrSettable(win, kAXZoomedAttrCompat)) {
    bool zoomed = false;
    if (GetAXBool(win, kAXZoomedAttrCompat, &zoomed) && zoomed) {
      SetAXBool(win, kAXZoomedAttrCompat, false);
    }
  }

  usleep(15000);
  CGPoint p = CGPointMake((CGFloat)std::lround(x), (CGFloat)std::lround(y));
  CGSize s = CGSizeMake((CGFloat)std::lround(std::max(1.0, w)),
                        (CGFloat)std::lround(std::max(1.0, h)));
  bool ok = ApplyWindowBoundsPrecise(win, p, s);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value MoveApplicationWindow(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected bounds object with name");

  std::string appName;
  if (!GetRequiredUtf8Property(env, argv[0], "name", &appName) || appName.empty()) {
    return MakeError(env, "name is required");
  }

  napi_value xV, yV, wV, hV;
  bool has = false;
  napi_has_named_property(env, argv[0], "x", &has);
  if (!has) return MakeError(env, "bounds.x is required");
  napi_get_named_property(env, argv[0], "x", &xV);
  napi_has_named_property(env, argv[0], "y", &has);
  if (!has) return MakeError(env, "bounds.y is required");
  napi_get_named_property(env, argv[0], "y", &yV);
  napi_has_named_property(env, argv[0], "w", &has);
  if (!has) return MakeError(env, "bounds.w is required");
  napi_get_named_property(env, argv[0], "w", &wV);
  napi_has_named_property(env, argv[0], "h", &has);
  if (!has) return MakeError(env, "bounds.h is required");
  napi_get_named_property(env, argv[0], "h", &hV);

  double x = 0, y = 0, w = 0, h = 0;
  napi_get_value_double(env, xV, &x);
  napi_get_value_double(env, yV, &y);
  napi_get_value_double(env, wV, &w);
  napi_get_value_double(env, hV, &h);
  if (!(w > 0) || !(h > 0)) return MakeError(env, "bounds.w/h must be > 0");

  NSRunningApplication* runningApp = FindRunningApplicationByName(appName);
  if (runningApp) {
    [runningApp activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    usleep(20000);
  }

  AXUIElementRef app = CopyApplicationByName(appName);
  if (!app) return MakeError(env, "Application process not found");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Application has no window");

  if (IsAXAttrSettable(win, kAXFullScreenAttrCompat)) {
    SetAXBool(win, kAXFullScreenAttrCompat, false);
  }
  if (IsAXAttrSettable(win, kAXZoomedAttrCompat)) {
    bool zoomed = false;
    if (GetAXBool(win, kAXZoomedAttrCompat, &zoomed) && zoomed) {
      SetAXBool(win, kAXZoomedAttrCompat, false);
    }
  }

  usleep(15000);
  CGPoint p = CGPointMake((CGFloat)std::lround(x), (CGFloat)std::lround(y));
  CGSize s = CGSizeMake((CGFloat)std::lround(std::max(1.0, w)),
                        (CGFloat)std::lround(std::max(1.0, h)));
  bool ok = ApplyWindowBoundsPrecise(win, p, s);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value MoveFocusedWindowAndMaximize(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected bounds object");

  napi_value xV, yV, wV, hV;
  bool has = false;
  napi_has_named_property(env, argv[0], "x", &has);
  if (!has) return MakeError(env, "bounds.x is required");
  napi_get_named_property(env, argv[0], "x", &xV);
  napi_has_named_property(env, argv[0], "y", &has);
  if (!has) return MakeError(env, "bounds.y is required");
  napi_get_named_property(env, argv[0], "y", &yV);
  napi_has_named_property(env, argv[0], "w", &has);
  if (!has) return MakeError(env, "bounds.w is required");
  napi_get_named_property(env, argv[0], "w", &wV);
  napi_has_named_property(env, argv[0], "h", &has);
  if (!has) return MakeError(env, "bounds.h is required");
  napi_get_named_property(env, argv[0], "h", &hV);

  double x = 0, y = 0, w = 0, h = 0;
  napi_get_value_double(env, xV, &x);
  napi_get_value_double(env, yV, &y);
  napi_get_value_double(env, wV, &w);
  napi_get_value_double(env, hV, &h);
  if (!(w > 0) || !(h > 0)) return MakeError(env, "bounds.w/h must be > 0");

  AXUIElementRef app = CopyFocusedApplication();
  if (!app) return MakeError(env, "Failed to access focused app");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Focused app has no window");

  usleep(15000);
  CGPoint p = CGPointMake((CGFloat)std::lround(x), (CGFloat)std::lround(y));
  CGSize s = CGSizeMake((CGFloat)std::lround(std::max(1.0, w)),
                        (CGFloat)std::lround(std::max(1.0, h)));
  bool ok = NativeMaximizeOrFallback(win, p, s);

  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value MoveApplicationWindowAndMaximize(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected bounds object with name");

  std::string appName;
  if (!GetRequiredUtf8Property(env, argv[0], "name", &appName) || appName.empty()) {
    return MakeError(env, "name is required");
  }

  napi_value xV, yV, wV, hV;
  bool has = false;
  napi_has_named_property(env, argv[0], "x", &has);
  if (!has) return MakeError(env, "bounds.x is required");
  napi_get_named_property(env, argv[0], "x", &xV);
  napi_has_named_property(env, argv[0], "y", &has);
  if (!has) return MakeError(env, "bounds.y is required");
  napi_get_named_property(env, argv[0], "y", &yV);
  napi_has_named_property(env, argv[0], "w", &has);
  if (!has) return MakeError(env, "bounds.w is required");
  napi_get_named_property(env, argv[0], "w", &wV);
  napi_has_named_property(env, argv[0], "h", &has);
  if (!has) return MakeError(env, "bounds.h is required");
  napi_get_named_property(env, argv[0], "h", &hV);

  double x = 0, y = 0, w = 0, h = 0;
  napi_get_value_double(env, xV, &x);
  napi_get_value_double(env, yV, &y);
  napi_get_value_double(env, wV, &w);
  napi_get_value_double(env, hV, &h);
  if (!(w > 0) || !(h > 0)) return MakeError(env, "bounds.w/h must be > 0");

  NSRunningApplication* runningApp = FindRunningApplicationByName(appName);
  if (runningApp) {
    [runningApp activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    usleep(20000);
  }

  AXUIElementRef app = CopyApplicationByName(appName);
  if (!app) return MakeError(env, "Application process not found");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Application has no window");

  usleep(15000);
  CGPoint p = CGPointMake((CGFloat)std::lround(x), (CGFloat)std::lround(y));
  CGSize s = CGSizeMake((CGFloat)std::lround(std::max(1.0, w)),
                        (CGFloat)std::lround(std::max(1.0, h)));
  bool ok = NativeMaximizeOrFallback(win, p, s);

  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value FullscreenFocusedWindow(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  AXUIElementRef app = CopyFocusedApplication();
  if (!app) return MakeError(env, "Failed to access focused app");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Focused app has no window");

  bool ok = EnterWindowFullscreen(win);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value FullscreenApplicationWindow(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected {name}");

  std::string appName;
  if (!GetRequiredUtf8Property(env, argv[0], "name", &appName) || appName.empty()) {
    return MakeError(env, "name is required");
  }

  AXUIElementRef app = CopyApplicationByName(appName);
  if (!app) return MakeError(env, "Application process not found");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Application has no window");

  bool ok = EnterWindowFullscreen(win);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

static napi_value IsFocusedWindowFullscreen(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  AXUIElementRef app = CopyFocusedApplication();
  if (!app) return MakeError(env, "Failed to access focused app");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Focused app has no window");

  bool isFull = false;
  bool ok = GetAXBool(win, kAXFullScreenAttrCompat, &isFull);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok && isFull, &out);
  return out;
}

static napi_value IsApplicationWindowFullscreen(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    return MakeError(env, "Accessibility permission is required");
  }

  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) return MakeError(env, "Expected {name}");

  std::string appName;
  if (!GetRequiredUtf8Property(env, argv[0], "name", &appName) || appName.empty()) {
    return MakeError(env, "name is required");
  }

  AXUIElementRef app = CopyApplicationByName(appName);
  if (!app) return MakeError(env, "Application process not found");
  AXUIElementRef win = CopyFocusedWindow(app);
  CFRelease(app);
  if (!win) return MakeError(env, "Application has no window");

  bool isFull = false;
  bool ok = GetAXBool(win, kAXFullScreenAttrCompat, &isFull);
  CFRelease(win);

  napi_value out;
  napi_get_boolean(env, ok && isFull, &out);
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "getDockItems", NAPI_AUTO_LENGTH, GetDockItems, nullptr, &fn);
  napi_set_named_property(env, exports, "getDockItems", fn);
  napi_value getBoundsFn;
  napi_create_function(env, "getFocusedWindowBounds", NAPI_AUTO_LENGTH,
                       GetFocusedWindowBounds, nullptr, &getBoundsFn);
  napi_set_named_property(env, exports, "getFocusedWindowBounds", getBoundsFn);
  napi_value getFocusedAppFn;
  napi_create_function(env, "getFocusedApplicationName", NAPI_AUTO_LENGTH,
                       GetFocusedApplicationName, nullptr, &getFocusedAppFn);
  napi_set_named_property(env, exports, "getFocusedApplicationName", getFocusedAppFn);
  napi_value getAppBoundsFn;
  napi_create_function(env, "getApplicationWindowBounds", NAPI_AUTO_LENGTH,
                       GetApplicationWindowBounds, nullptr, &getAppBoundsFn);
  napi_set_named_property(env, exports, "getApplicationWindowBounds", getAppBoundsFn);
  napi_value moveFn;
  napi_create_function(env, "moveFocusedWindow", NAPI_AUTO_LENGTH, MoveFocusedWindow,
                       nullptr, &moveFn);
  napi_set_named_property(env, exports, "moveFocusedWindow", moveFn);
  napi_value moveAppFn;
  napi_create_function(env, "moveApplicationWindow", NAPI_AUTO_LENGTH,
                       MoveApplicationWindow, nullptr, &moveAppFn);
  napi_set_named_property(env, exports, "moveApplicationWindow", moveAppFn);
  napi_value moveMaxFn;
  napi_create_function(env, "moveFocusedWindowAndMaximize", NAPI_AUTO_LENGTH,
                       MoveFocusedWindowAndMaximize, nullptr, &moveMaxFn);
  napi_set_named_property(env, exports, "moveFocusedWindowAndMaximize", moveMaxFn);
  napi_value moveAppMaxFn;
  napi_create_function(env, "moveApplicationWindowAndMaximize", NAPI_AUTO_LENGTH,
                       MoveApplicationWindowAndMaximize, nullptr, &moveAppMaxFn);
  napi_set_named_property(env, exports, "moveApplicationWindowAndMaximize", moveAppMaxFn);
  napi_value fullscreenFn;
  napi_create_function(env, "fullscreenFocusedWindow", NAPI_AUTO_LENGTH,
                       FullscreenFocusedWindow, nullptr, &fullscreenFn);
  napi_set_named_property(env, exports, "fullscreenFocusedWindow", fullscreenFn);
  napi_value fullscreenAppFn;
  napi_create_function(env, "fullscreenApplicationWindow", NAPI_AUTO_LENGTH,
                       FullscreenApplicationWindow, nullptr, &fullscreenAppFn);
  napi_set_named_property(env, exports, "fullscreenApplicationWindow",
                          fullscreenAppFn);
  napi_value isFullscreenFn;
  napi_create_function(env, "isFocusedWindowFullscreen", NAPI_AUTO_LENGTH,
                       IsFocusedWindowFullscreen, nullptr, &isFullscreenFn);
  napi_set_named_property(env, exports, "isFocusedWindowFullscreen", isFullscreenFn);
  napi_value isFullscreenAppFn;
  napi_create_function(env, "isApplicationWindowFullscreen", NAPI_AUTO_LENGTH,
                       IsApplicationWindowFullscreen, nullptr, &isFullscreenAppFn);
  napi_set_named_property(env, exports, "isApplicationWindowFullscreen",
                          isFullscreenAppFn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
