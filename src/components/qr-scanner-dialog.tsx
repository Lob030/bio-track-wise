import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { parseBoxQr } from "@/lib/box-qr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Detector = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export function QrScannerDialog({ onBox }: { onBox: (boxId: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "unsupported">(
    "idle",
  );

  const stopCamera = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");
  };

  useEffect(() => () => stopCamera(), []);

  const acceptValue = (value: string) => {
    const parsed = parseBoxQr(value, window.location.origin);
    if (!parsed) {
      toast.error("El código no corresponde a una caja válida de BioTrack.");
      return false;
    }
    onBox(parsed.boxId);
    stopCamera();
    setOpen(false);
    setManual("");
    return true;
  };

  const startCamera = async () => {
    const DetectorClass = (window as typeof window & { BarcodeDetector?: DetectorConstructor })
      .BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      return;
    }
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return stopCamera();
      video.srcObject = stream;
      await video.play();
      setCameraState("active");
      const detector = new DetectorClass({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results[0]?.rawValue && acceptValue(results[0].rawValue)) return;
        } catch {
          // Some browsers reject frames while the camera is warming up.
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch {
      stopCamera();
      toast.error("No fue posible abrir la cámara. Revisa el permiso del navegador.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) stopCamera();
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-11 gap-2">
          <ScanLine className="h-5 w-5" /> Escanear caja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Escanear caja</DialogTitle>
          <DialogDescription>Apunta al QR impreso en la caja.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-md border bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {cameraState !== "active" && (
              <div className="absolute inset-0 grid place-items-center p-5 text-center text-sm text-white">
                {cameraState === "unsupported"
                  ? "Este navegador no permite lectura QR directa. Ingresa el enlace o identificador abajo."
                  : "Activa la cámara para comenzar."}
              </div>
            )}
            {cameraState === "active" && (
              <div className="pointer-events-none absolute inset-[18%] border-2 border-white" />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-2"
            onClick={startCamera}
            disabled={cameraState === "starting" || cameraState === "active"}
          >
            <Camera className="h-5 w-5" />
            {cameraState === "starting" ? "Abriendo cámara..." : "Usar cámara"}
          </Button>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="Enlace o ID de caja"
              className="h-11"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-11 w-11 shrink-0"
              title="Abrir caja"
              onClick={() => acceptValue(manual)}
            >
              <Keyboard className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
