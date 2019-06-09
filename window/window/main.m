//
//  main.m
//  window
//
//  Created by Longbiao CHEN on 6/5/19.
//  Copyright © 2019 LONGBIAO CHEN. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>

int main(int argc, const char * argv[]) {

    NSRunningApplication *app = [[NSWorkspace sharedWorkspace] frontmostApplication];
    printf("%s",app.localizedName.UTF8String);
    AXUIElementRef appRef = AXUIElementCreateApplication([app processIdentifier]);
    AXUIElementRef winRef;
    AXUIElementCopyAttributeValue(appRef, kAXFocusedWindowAttribute, (CFTypeRef *)&winRef);
    if(argc==1){
        // no argument is passed, return frontmost application
//        printf("No screen selected.\n");
        return 0;
    }
    // argument 1 is screen id: 0 - CENTER, 1 - LEFT, 2 - RIGHT
    int screenID = atoi(argv[1]);
//    printf("%d", screenID);
    NSScreen *screen = NSScreen.screens[screenID];
    CGRect bounds = CGDisplayBounds([[screen deviceDescription][@"NSScreenNumber"] unsignedIntValue]);
//    printf("bounds.origin: [%f %f]\n", bounds.origin.x,bounds.origin.y);
//    printf("bounds.size: [%f %f]\n", bounds.size.width, bounds.size.height);
    AXValueRef posRef = AXValueCreate(kAXValueCGPointType, &bounds.origin);
    AXValueRef sizeRef = AXValueCreate(kAXValueCGSizeType, &bounds.size);
    AXUIElementSetAttributeValue(winRef, kAXPositionAttribute, posRef);
    AXUIElementSetAttributeValue(winRef, kAXSizeAttribute, sizeRef);

}
