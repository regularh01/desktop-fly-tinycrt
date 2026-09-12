// TinyCRTModel.swift — 2D animated retro terminal pet skin for DesktopFly,
// driven by the real FlyWire v783 connectome & MaleCNS v1.0 motor dynamics.
//
// Satisfies the identical `FlyModel` contract as FlyModel.swift and BeetleModel.swift,
// but renders as an upright, pixel-perfect 2D CRT monitor sprite with 9 animations
// extracted from the official Codex pet bundle format.

import Cocoa
import SceneKit

// MARK: - Animation Manifest & Specs

struct CRTAnimSpec {
    let row: Int
    let frames: Int
    let durationsMs: [Double]
    let loops: Bool
    
    var totalDurationMs: Double { durationsMs.reduce(0, +) }
    
    func frameIndex(at timeMs: Double) -> Int {
        guard totalDurationMs > 0 else { return 0 }
        let t = loops ? timeMs.truncatingRemainder(dividingBy: totalDurationMs) : min(timeMs, totalDurationMs - 1)
        var acc: Double = 0
        for (i, d) in durationsMs.enumerated() {
            acc += d
            if t < acc { return min(i, frames - 1) }
        }
        return min(durationsMs.count - 1, frames - 1)
    }
}

let CRT_ANIMATIONS: [String: CRTAnimSpec] = [
    "idle": CRTAnimSpec(
        row: 0, frames: 6,
        durationsMs: [1680, 660, 660, 840, 840, 1920],
        loops: true
    ),
    "running-right": CRTAnimSpec(
        row: 1, frames: 8,
        durationsMs: [120, 120, 120, 120, 120, 120, 120, 220],
        loops: true
    ),
    "running-left": CRTAnimSpec(
        row: 2, frames: 8,
        durationsMs: [120, 120, 120, 120, 120, 120, 120, 220],
        loops: true
    ),
    "waving": CRTAnimSpec(
        row: 3, frames: 4,
        durationsMs: [140, 140, 140, 280],
        loops: true
    ),
    "jumping": CRTAnimSpec(
        row: 4, frames: 5,
        durationsMs: [140, 140, 140, 140, 280],
        loops: false
    ),
    "failed": CRTAnimSpec(
        row: 5, frames: 8,
        durationsMs: [140, 140, 140, 140, 140, 140, 140, 240],
        loops: true
    ),
    "waiting": CRTAnimSpec(
        row: 6, frames: 6,
        durationsMs: [150, 150, 150, 150, 150, 260],
        loops: true
    ),
    "running": CRTAnimSpec(
        row: 7, frames: 6,
        durationsMs: [120, 120, 120, 120, 120, 220],
        loops: true
    ),
    "review": CRTAnimSpec(
        row: 8, frames: 6,
        durationsMs: [150, 150, 150, 150, 150, 280],
        loops: true
    )
]

// MARK: - Spritesheet Cache

final class TinyCRTSheet {
    static let shared = TinyCRTSheet()
    
    let frameWidth: Int = 192
    let frameHeight: Int = 208
    let columns: Int = 8
    let rows: Int = 9
    
    // Cached CGImages for each (row, col)
    private var frames: [Int: [CGImage]] = [:]
    
    private init() {
        // Try multiple paths: relative to executable, relative to working dir, or direct asset path
        let candidates = [
            Bundle.main.resourcePath.map { URL(fileURLWithPath: $0).appendingPathComponent("assets/tiny-crt/spritesheet.webp") },
            URL(fileURLWithPath: "assets/tiny-crt/spritesheet.webp"),
            URL(fileURLWithPath: "/Users/jgh/Project/desktop-fly/assets/tiny-crt/spritesheet.webp")
        ].compactMap { $0 }
        
        var loadedImage: CGImage? = nil
        for candidate in candidates {
            if let data = try? Data(contentsOf: candidate),
               let rep = NSBitmapImageRep(data: data),
               let cg = rep.cgImage {
                loadedImage = cg
                break
            }
        }
        
        guard let sheet = loadedImage else {
            NSLog("[TinyCRTSheet] Warning: could not load spritesheet.webp from candidates")
            return
        }
        
        for r in 0..<rows {
            var rowFrames: [CGImage] = []
            for c in 0..<columns {
                let cropRect = CGRect(x: c * frameWidth, y: r * frameHeight, width: frameWidth, height: frameHeight)
                if let cropped = sheet.cropping(to: cropRect) {
                    rowFrames.append(cropped)
                }
            }
            frames[r] = rowFrames
        }
        NSLog("[TinyCRTSheet] Successfully sliced %d rows of Tiny CRT sprites", rows)
    }
    
    func frame(row: Int, col: Int) -> CGImage? {
        guard let rowFrames = frames[row], col < rowFrames.count else { return nil }
        return rowFrames[col]
    }
}

// MARK: - Upright Billboard Sprite Node

final class TinyCRTNode: SCNNode {
    private let plane: SCNPlane
    private let planeNode: SCNNode
    private(set) var animName: String = "idle"
    private(set) var animTimeMs: Double = 0
    private var lastHorizontalDir: CGFloat = 1.0 // +1 right, -1 left
    private var dirHoldTimeMs: Double = 1000.0
    
    // Position tracking for true physical displacement
    private var lastPosX: CGFloat? = nil
    private var lastPosY: CGFloat? = nil
    
    // One-shot state control (e.g. escape jumping)
    private(set) var isOneShotPlaying: Bool = false
    private var oneShotAnim: String = ""
    private var oneShotElapsedMs: Double = 0
    private var lastIsEscaping: Bool = false
    
    // Hysteresis for running vs walking
    private var isSprinting: Bool = false
    // Hysteresis for moving vs stopped
    private var isMoving: Bool = false
    private var stateHoldTimeMs: Double = 1000.0
    
    override init() {
        // Size calibrated to match fruit fly scale: 44 pt wide x 48 pt high
        self.plane = SCNPlane(width: 44, height: 48)
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.isDoubleSided = true
        mat.diffuse.magnificationFilter = .nearest
        mat.diffuse.minificationFilter = .linear
        self.plane.materials = [mat]
        
        self.planeNode = SCNNode(geometry: plane)
        // Position slightly elevated so base touches ground at z=0
        self.planeNode.position = SCNVector3(0, 0, 10.0)
        
        super.init()
        self.addChildNode(planeNode)
        
        if let initialFrame = TinyCRTSheet.shared.frame(row: 0, col: 0) {
            mat.diffuse.contents = initialFrame
        }
    }
    
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    
    func update(fly: Fly, dt: CGFloat) {
        let dtMs = Double(dt * 1000.0)
        
        // 1. Calculate true displacement velocity from world coordinates
        var actualVx: CGFloat = 0
        var actualSpeed: CGFloat = 0
        if let lx = lastPosX, let ly = lastPosY {
            let dx = fly.pos.x - lx
            let dy = fly.pos.y - ly
            if abs(dx) < 150 && abs(dy) < 150 && dt > 1e-4 {
                actualVx = dx / dt
                actualSpeed = hypot(dx, dy) / dt
            } else {
                let moveSign: CGFloat = fly.backwardTimer > 0 ? -1.0 : 1.0
                actualVx = cos(fly.heading) * (fly.backwardTimer > 0 ? 22 : fly.speed) * moveSign
                actualSpeed = fly.backwardTimer > 0 ? 22 : fly.speed
            }
        } else {
            let moveSign: CGFloat = fly.backwardTimer > 0 ? -1.0 : 1.0
            actualVx = cos(fly.heading) * (fly.backwardTimer > 0 ? 22 : fly.speed) * moveSign
            actualSpeed = fly.backwardTimer > 0 ? 22 : fly.speed
        }
        lastPosX = fly.pos.x
        lastPosY = fly.pos.y
        
        // 2. Escape scare trigger: strictly via explicit escape flag (rising edge) or visual scare trigger
        let isEscapeTriggered = (fly.isEscaping && !lastIsEscaping) || fly.visualScare
        fly.visualScare = false
        lastIsEscaping = fly.isEscaping
        
        if isEscapeTriggered && !isOneShotPlaying {
            isOneShotPlaying = true
            oneShotAnim = "jumping"
            oneShotElapsedMs = 0
            animName = "jumping"
            animTimeMs = 0
        }
        
        // 3. Determine target animation
        var targetAnim: String = animName
        
        if isOneShotPlaying {
            oneShotElapsedMs += dtMs
            animTimeMs = oneShotElapsedMs
            if let spec = CRT_ANIMATIONS[oneShotAnim], oneShotElapsedMs >= spec.totalDurationMs {
                isOneShotPlaying = false
            }
            targetAnim = oneShotAnim
        } else {
            // Physical moving vs stopped hysteresis: move >= 4.0, stop < 1.5
            if isMoving {
                if actualSpeed < 1.5 && fly.backwardTimer == 0 {
                    isMoving = false
                }
            } else {
                if actualSpeed >= 4.0 || fly.backwardTimer > 0 {
                    isMoving = true
                }
            }

            // Speed hysteresis for sprinting / running:
            // Must be physically moving; drops out if physical speed < 65 OR if stopped
            if isSprinting {
                if !isMoving || actualSpeed < 65.0 {
                    isSprinting = false
                }
            } else {
                if isMoving && actualSpeed >= 85.0 {
                    isSprinting = true
                }
            }
            
            if fly.state == .flying {
                // Ongoing flight / takeoff: fast running animation
                targetAnim = "running"
            } else if fly.state == .grooming {
                // Grooming (aDN1 neuron): waiting / clean screen animation
                targetAnim = "waiting"
            } else if fly.state == .idle || fly.state == .sleeping || !isMoving {
                // Stopped physically or idle: render as idle
                targetAnim = "idle"
            } else if isSprinting {
                targetAnim = "running"
            } else {
                // Walking (including MDN backward stepping)
                dirHoldTimeMs += dtMs
                let desiredDir: CGFloat?
                if actualVx > 2.0 {
                    desiredDir = 1.0
                } else if actualVx < -2.0 {
                    desiredDir = -1.0
                } else {
                    desiredDir = nil
                }
                
                if let d = desiredDir, d != lastHorizontalDir {
                    if dirHoldTimeMs >= 100.0 {
                        lastHorizontalDir = d
                        dirHoldTimeMs = 0
                    }
                }
                targetAnim = lastHorizontalDir > 0 ? "running-right" : "running-left"
            }
            
            stateHoldTimeMs += dtMs
            if targetAnim != animName {
                if stateHoldTimeMs >= 100.0 || targetAnim == "idle" || targetAnim == "running" {
                    animName = targetAnim
                    animTimeMs = 0
                    stateHoldTimeMs = 0
                }
            } else {
                animTimeMs += dtMs
            }
        }
        
        guard let spec = CRT_ANIMATIONS[animName] else { return }
        let frameIdx = spec.frameIndex(at: animTimeMs)
        
        if let frameImage = TinyCRTSheet.shared.frame(row: spec.row, col: frameIdx) {
            plane.materials.first?.diffuse.contents = frameImage
        }
        
        // Cancel Fly root node's z-rotation (heading) so the monitor always stays upright on desktop
        // Fly.syncNode sets eulerAngles.z = heading - pi/2, so counteract it here
        planeNode.eulerAngles = SCNVector3(0, 0, -(fly.heading - .pi / 2))
    }
}

// MARK: - Body Builder (FlyModel Contract Conformance)

func buildTinyCRTModel() -> FlyModel {
    let root = SCNNode()
    root.scale = SCNVector3(FLY_SCALE, FLY_SCALE, FLY_SCALE)
    
    let crtNode = TinyCRTNode()
    root.addChildNode(crtNode)
    
    // Six hidden legs matching real fly geometry to satisfy FlyModel contract and kinematics
    let z: CGFloat = 4.5
    let specs: [(CGFloat, SCNVector3, CGFloat, CGFloat, Bool, CGFloat, CGFloat, CGFloat)] = [
        ( 1, SCNVector3( 3.1,  5.3, z),  0.95, 0.0, true,  4.2,  4.8, 3.2),
        (-1, SCNVector3(-3.1,  5.3, z),  0.95, 0.5, true,  4.2,  4.8, 3.2),
        ( 1, SCNVector3( 3.7,  2.0, z), -0.10, 0.5, false, 4.8,  5.6, 3.8),
        (-1, SCNVector3(-3.7,  2.0, z), -0.10, 0.0, false, 4.8,  5.6, 3.8),
        ( 1, SCNVector3( 3.3, -1.2, z), -0.95, 0.0, false, 5.8,  7.0, 4.6),
        (-1, SCNVector3(-3.3, -1.2, z), -0.95, 0.5, false, 5.8,  7.0, 4.6),
    ]
    var dummyLegs: [Leg] = []
    for (side, attach, yawOff, phase, front, femur, tibia, tarsus) in specs {
        let baseYaw: CGFloat = side > 0 ? yawOff : (.pi - yawOff)
        let leg = buildLeg(attach: attach, baseYaw: baseYaw, swingSign: side, phase: phase,
                           isFront: front, femur: femur, tibia: tibia, tarsus: tarsus)
        leg.root.isHidden = true
        root.addChildNode(leg.root)
        dummyLegs.append(leg)
    }
    
    // Dummy wings and abdomen
    let dummyFoldedWings = SCNNode()
    dummyFoldedWings.isHidden = true
    let wingL = SCNNode(geometry: wingShape())
    let wingR = SCNNode(geometry: wingShape())
    dummyFoldedWings.addChildNode(wingL)
    dummyFoldedWings.addChildNode(wingR)
    root.addChildNode(dummyFoldedWings)
    
    let dummyBlurL = SCNNode()
    dummyBlurL.isHidden = true
    root.addChildNode(dummyBlurL)
    
    let dummyBlurR = SCNNode()
    dummyBlurR.isHidden = true
    root.addChildNode(dummyBlurR)
    
    let dummyAbdomen = SCNNode()
    dummyAbdomen.isHidden = true
    root.addChildNode(dummyAbdomen)
    
    return FlyModel(
        root: root,
        legs: dummyLegs,
        foldedWings: dummyFoldedWings,
        blurWingL: dummyBlurL,
        blurWingR: dummyBlurR,
        abdomen: dummyAbdomen,
        elytraL: nil,
        elytraR: nil,
        wingFlightSpread: 0.625,
        onUpdate: { fly, dt in
            crtNode.update(fly: fly, dt: dt)
        }
    )
}
