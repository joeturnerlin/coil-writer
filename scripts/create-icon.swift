// Original Coil icon: cyan screenplay coil on the editor's dark background.
import AppKit
let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSColor(calibratedRed: 0.06, green: 0.08, blue: 0.11, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 210, yRadius: 210).fill()
let path = NSBezierPath()
path.lineWidth = 68
path.lineCapStyle = .round
path.move(to: NSPoint(x: 740, y: 680))
path.curve(to: NSPoint(x: 285, y: 540), controlPoint1: NSPoint(x: 470, y: 890), controlPoint2: NSPoint(x: 200, y: 790))
path.curve(to: NSPoint(x: 700, y: 430), controlPoint1: NSPoint(x: 380, y: 280), controlPoint2: NSPoint(x: 890, y: 700))
path.curve(to: NSPoint(x: 290, y: 345), controlPoint1: NSPoint(x: 600, y: 195), controlPoint2: NSPoint(x: 380, y: 195))
NSColor(calibratedRed: 0.3, green: 0.85, blue: 0.88, alpha: 1).setStroke()
path.stroke()
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "build/icon.png"))
