//
//  main.m
//  rail
//
//  Created by Longbiao CHEN on 5/29/19.
//  Copyright © 2019 LONGBIAO CHEN. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>


int main(int argc, const char * argv[]) {
    
    NSArray *apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.dock"];
    
    NSRunningApplication *dockApp = apps[0];
    AXUIElementRef dockElement = AXUIElementCreateApplication(dockApp.processIdentifier);
    
    AXUIElementRef window;
    AXUIElementCopyAttributeValue(dockElement, kAXFocusedWindowAttribute, (CFTypeRef *)&window);
    
    CFArrayRef children = NULL;
    AXUIElementCopyAttributeValue(dockElement, kAXChildrenAttribute, (const void **)&children);
    AXUIElementCopyAttributeValue((AXUIElementRef)CFArrayGetValueAtIndex(children, 0), kAXChildrenAttribute, (const void **)&children);
    
    printf("[");
    
    for(int i = 0; i < CFArrayGetCount(children); ++i) {
        if(i) printf(", ");
        AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(children, i);
        
        CFStringRef identifier;
        AXUIElementCopyAttributeValue(child, kAXTitleAttribute, (const void **)&identifier);
        
        CFTypeRef value;
        AXUIElementCopyAttributeValue(child, kAXPositionAttribute, (CFTypeRef *)&value);
        CGPoint pos;
        AXValueGetValue(value, kAXValueCGPointType, &pos);
        printf("{\"name\": \"%s\", \"pos\": {\"x\": %.0f, \"y\": %.0f}}", [(__bridge NSString *)identifier UTF8String], pos.x, pos.y);
    }
    
    printf("]\n");
}
