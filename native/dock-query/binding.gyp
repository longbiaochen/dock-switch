{
  "targets": [
    {
      "target_name": "dock_query",
      "sources": ["dock_query.mm"],
      "cflags_cc": ["-std=c++17"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "OTHER_LDFLAGS": [
          "-framework Cocoa",
          "-framework ApplicationServices"
        ]
      }
    }
  ]
}
