import Foundation
import Vision
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
let imagePath = CommandLine.arguments[1]
let expectedURL = CommandLine.arguments[2]
try VNImageRequestHandler(url: URL(fileURLWithPath: imagePath), options: [:]).perform([request])
let payloads = (request.results ?? []).compactMap { $0.payloadStringValue }
guard payloads == [expectedURL] else { fatalError("Rendered QR does not match the event URL") }
let data = try JSONSerialization.data(withJSONObject: ["kind": "ACTUAL_HOSTED_SCREENSHOT_QR_DECODE", "decoder": "Apple Vision", "image": imagePath, "payloads": payloads, "matchesExpectedURL": true], options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
