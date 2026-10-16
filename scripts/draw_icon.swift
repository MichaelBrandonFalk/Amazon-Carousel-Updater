import AppKit
import Foundation

let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for (size, name) in [(16,"icon_16x16.png"),(32,"icon_16x16@2x.png"),(32,"icon_32x32.png"),(64,"icon_32x32@2x.png"),(128,"icon_128x128.png"),(256,"icon_128x128@2x.png"),(256,"icon_256x256.png"),(512,"icon_256x256@2x.png"),(512,"icon_512x512.png"),(1024,"icon_512x512@2x.png")] {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(size)
    NSColor(calibratedRed: 0.11, green: 0.35, blue: 0.28, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: s*0.08, y:s*0.08,width:s*0.84,height:s*0.84), xRadius:s*0.16,yRadius:s*0.16).fill()
    for (i,width) in [0.51,0.40,0.29].enumerated() {
        (i == 0 ? NSColor.white : NSColor(calibratedRed:0.64,green:0.84,blue:0.72,alpha:1)).setFill()
        NSBezierPath(roundedRect:NSRect(x:s*0.23,y:s*(0.63-Double(i)*0.16),width:s*width,height:s*0.09),xRadius:s*0.015,yRadius:s*0.015).fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output).appendingPathComponent(name))
}
