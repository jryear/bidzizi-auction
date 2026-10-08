// Independent rendered-pixel QR decoder. Uses the macOS Vision framework;
// it does not import the product's encoder or inspect URL/data attributes.
import Foundation
import Vision
import ImageIO
guard CommandLine.arguments.count == 2,
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fputs("QR_INPUT_UNAVAILABLE\n", stderr); exit(99)
}
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
do {
  try VNImageRequestHandler(cgImage: image).perform([request])
  let values = (request.results ?? []).compactMap { $0.payloadStringValue }
  guard values.count == 1 else { fputs("QR_PIXELS_UNDECODABLE\n", stderr); exit(1) }
  print(values[0])
} catch {
  fputs("QR_DECODER_UNAVAILABLE\n", stderr); exit(99)
}
