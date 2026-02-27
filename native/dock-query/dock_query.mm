#include <node_api.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

#include <algorithm>
#include <string>
#include <unordered_set>
#include <vector>

struct DockItem {
  std::string name;
  int x;
  int y;
};

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

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "getDockItems", NAPI_AUTO_LENGTH, GetDockItems, nullptr, &fn);
  napi_set_named_property(env, exports, "getDockItems", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
