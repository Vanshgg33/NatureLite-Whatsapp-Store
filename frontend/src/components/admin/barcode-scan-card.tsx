'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ScanBarcode, Camera, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { lookupBarcode, type BarcodeProduct } from '@/lib/barcode-lookup';

interface BarcodeScanCardProps {
  onProductFound: (product: BarcodeProduct) => void;
  disabled?: boolean;
}

export function BarcodeScanCard({ onProductFound, disabled }: BarcodeScanCardProps) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupSuccess, setLookupSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<any>(null);

  const handleLookup = useCallback(async (code: string) => {
    const trimmed = String(code).trim().replace(/\D/g, '');
    if (trimmed.length < 8) {
      setLookupError('Enter a valid barcode (8–14 digits)');
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);
    setLookupSuccess(false);

    const product = await lookupBarcode(trimmed);

    if (product) {
      onProductFound(product);
      setLookupSuccess(true);
      setBarcodeInput('');
      setTimeout(() => setLookupSuccess(false), 2000);
    } else {
      onProductFound({
        name: '',
        sku: trimmed,
        description: undefined,
      });
      setLookupSuccess(true);
      setBarcodeInput('');
      setTimeout(() => setLookupSuccess(false), 2000);
    }

    setIsLookingUp(false);
  }, [onProductFound]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) handleLookup(barcodeInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      handleLookup(barcodeInput);
    }
  };

  const startCamera = useCallback(() => {
    setShowCamera(true);
    setCameraError(null);
  }, []);

  const stopCamera = useCallback(() => {
    const scanner = html5QrCodeRef.current;
    if (scanner?.isScanning?.()) {
      scanner.stop().catch(() => {});
    }
    html5QrCodeRef.current = null;
    setShowCamera(false);
  }, []);

  useEffect(() => {
    if (!showCamera) return;
    let mounted = true;
    const init = async () => {
      await new Promise((r) => setTimeout(r, 150));
      if (!mounted) return;
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('barcode-reader');
        html5QrCodeRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            handleLookup(decodedText);
            stopCamera();
          },
          () => {}
        );
      } catch (err: unknown) {
        if (mounted) {
          setCameraError(err instanceof Error ? err.message : 'Could not start camera');
        }
      }
    };
    init();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [showCamera, handleLookup, stopCamera]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" />
            Scan Barcode
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Use a barcode scanner or phone camera to auto-fill product details. Works with UPC, EAN, and similar codes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="barcode-input" className="sr-only">
                Barcode
              </Label>
              <Input
                id="barcode-input"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan or type barcode, then press Enter"
                disabled={disabled}
                className="font-mono"
              />
            </div>
            <Button type="submit" disabled={!barcodeInput.trim() || isLookingUp}>
              {isLookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Lookup'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={startCamera}
              disabled={disabled}
              title="Scan with camera"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </form>

          {lookupError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              {lookupError}
            </div>
          )}
          {lookupSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Product details filled from barcode
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCamera} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="max-w-md" onInteractOutside={() => stopCamera()}>
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              id="barcode-reader"
              className="rounded-lg overflow-hidden bg-black min-h-[240px] w-full"
            />
            {cameraError && (
              <p className="text-sm text-red-600">{cameraError}</p>
            )}
            <Button variant="outline" onClick={stopCamera} className="w-full">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
