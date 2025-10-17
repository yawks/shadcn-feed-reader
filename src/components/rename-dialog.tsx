"use client"

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface RenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialValue?: string
  onConfirm: (value: string) => Promise<void> | void
  confirmLabel?: string
  className?: string
}

export function RenameDialog({ open, onOpenChange, title, initialValue = '', onConfirm, confirmLabel = 'Renommer', className }: RenameDialogProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleConfirm = async () => {
    await onConfirm(value.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-lg', className)}>
        <DialogTitle>{title}</DialogTitle>
        <div className="mt-4">
          <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleConfirm}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
