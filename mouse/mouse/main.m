//
//  main.m
//  mouse
//
//  Created by Longbiao CHEN on 6/7/19.
//  Copyright © 2019 LONGBIAO CHEN. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>

int main(int argc, const char * argv[]) {

    if(argc==1){
        // no argument is passed, return frontmost application
//        printf("No screen selected.\n");
        return 0;
    }
    // argument 1 is screen id: 0 - CENTER, 1 - LEFT, 2 - RIGHT
    int screenID = atoi(argv[1]);
//    printf("%d\n", screenID);
    NSScreen *screen = NSScreen.screens[screenID];
    CGRect bounds = CGDisplayBounds([[screen deviceDescription][@"NSScreenNumber"] unsignedIntValue]);
//    printf("bounds.origin: [%.0f, %.0f]\n", bounds.origin.x,bounds.origin.y);
//    printf("bounds.size: [%.0f, %.0f]\n", bounds.size.width, bounds.size.height);
    CGPoint pos = {.x =  bounds.origin.x + bounds.size.width/2,
        .y =  bounds.origin.y + bounds.size.height/2
    };
//    printf("pos: [%.0f, %.0f]\n", pos.x, pos.y);
    CGDisplayMoveCursorToPoint(0, pos);

    return 0;
    
}
