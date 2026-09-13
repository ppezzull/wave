'use client'

// Image cropper — SiteLab profile cutter (react-image-crop), restyled on
// wave glass so the pixel backdrop shows through like a feed card.

import React, { type SyntheticEvent } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop'
import { CropIcon, Trash2Icon } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import 'react-image-crop/dist/ReactCrop.css'

export type FileWithPreview = File & { preview: string }

interface ImageCropperProps {
  dialogOpen: boolean
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  selectedFile: FileWithPreview | null
  setSelectedFile: React.Dispatch<React.SetStateAction<FileWithPreview | null>>
  onCroppedImage?: (file: File) => void
}

export function ImageCropper({
  dialogOpen,
  setDialogOpen,
  selectedFile,
  setSelectedFile,
  onCroppedImage,
}: ImageCropperProps) {
  const aspect = 1
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = React.useState<Crop>()
  const [croppedImageUrl, setCroppedImageUrl] = React.useState('')

  function onImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, aspect))
  }

  function onCropComplete(next: PixelCrop) {
    if (imgRef.current && next.width && next.height) {
      setCroppedImageUrl(getCroppedImg(imgRef.current, next))
    }
  }

  function onCrop() {
    if (croppedImageUrl && selectedFile && onCroppedImage) {
      const fileName = selectedFile.name.replace(/\.[^.]+$/, '') + '.png'
      onCroppedImage(dataURLtoFile(croppedImageUrl, fileName))
    }
    setDialogOpen(false)
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) setSelectedFile(null)
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/25 backdrop-blur-[2px]"
        className="glass-card gap-0 rounded-[16px] border-wave-border bg-[var(--glass-card-bg)] p-0 shadow-none sm:max-w-[720px]"
      >
        <DialogTitle className="sr-only">Crop image</DialogTitle>
        <div className="w-full p-5">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => onCropComplete(c)}
            aspect={aspect}
            circularCrop
            className="wave-image-crop max-h-[560px] w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              className="max-h-[560px] w-full rounded-none object-contain"
              alt="Image to crop"
              src={selectedFile?.preview}
              onLoad={onImageLoad}
            />
          </ReactCrop>
        </div>
        <DialogFooter className="flex flex-row justify-center gap-3 p-5 pt-0">
          <DialogClose asChild>
            <button
              type="button"
              className="glass-btn flex h-11 max-w-[140px] flex-1 items-center justify-center rounded-[10px] font-sans text-[14px] font-semibold text-wave-text"
              onClick={() => setSelectedFile(null)}
            >
              <Trash2Icon className="mr-1.5 size-4" aria-hidden="true" />
              Cancel
            </button>
          </DialogClose>
          <button
            type="button"
            className="flex h-11 max-w-[140px] flex-1 items-center justify-center rounded-[10px] font-sans text-[14px] font-semibold text-wave-text"
            style={{ border: '1px solid #000000' }}
            onClick={onCrop}
          >
            <CropIcon className="mr-1.5 size-4" aria-hidden="true" />
            Crop
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): Crop {
  return centerCrop(
    makeAspectCrop(
      { unit: '%', width: 50, height: 50 },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1] ?? '')
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new File([u8arr], filename, { type: mime })
}

function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): string {
  const canvas = document.createElement('canvas')
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  canvas.width = crop.width * scaleX
  canvas.height = crop.height * scaleY
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width * scaleX,
      crop.height * scaleY,
    )
  }
  return canvas.toDataURL('image/png', 1.0)
}
