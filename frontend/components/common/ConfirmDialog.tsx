import { cloneElement, isValidElement, memo, useCallback } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import {
  MLButton,
  MLDialog,
  MLDialogContent,
  MLDialogDescription,
  MLDialogHeader,
  MLDialogTitle,
  MLTypography,
} from "ml-uikit";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmingLabel?: string;
  cancelLabel: string;
  onOpen: () => void;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
  confirmVariant?: "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive";
  trigger?: ReactElement<TriggerElementProps>;
  triggerAriaLabel?: string;
  triggerDisabled?: boolean;
  footerNote?: ReactNode;
};

type TriggerElementProps = {
  onClick?: (event: MouseEvent) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

const ConfirmDialog = memo(
  ({
    open,
    title,
    description,
    confirmLabel,
    confirmingLabel,
    cancelLabel,
    onOpen,
    onClose,
    onConfirm,
    isConfirming = false,
    confirmVariant = "destructive",
    trigger,
    triggerAriaLabel,
    triggerDisabled = false,
    footerNote,
  }: ConfirmDialogProps) => {
    const handleOpenChange = useCallback(
      (nextOpen: boolean) => {
        if (!nextOpen) {
          onClose();
        }
      },
      [onClose]
    );
    const handleOpen = useCallback(() => {
      onOpen();
    }, [onOpen]);
    const handleClose = useCallback(() => {
      onClose();
    }, [onClose]);
    const handleConfirm = useCallback(() => {
      onConfirm();
    }, [onConfirm]);

    const triggerNode = trigger && isValidElement<TriggerElementProps>(trigger)
      ? cloneElement(trigger, {
          onClick: (event: MouseEvent) => {
            trigger.props.onClick?.(event);
            if (!event.defaultPrevented) {
              handleOpen();
            }
          },
          disabled: triggerDisabled || trigger.props.disabled,
          "aria-label": trigger.props["aria-label"] || triggerAriaLabel,
        })
      : null;

    return (
      <MLDialog open={open} onOpenChange={handleOpenChange}>
        {triggerNode}
        <MLDialogContent className="max-w-[440px] rounded-[16px] border border-[#e6e6e6] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.18)] [&>button]:hidden">
          <MLDialogHeader className="space-y-2 text-left">
            <MLDialogTitle className="text-[18px] font-semibold leading-[24px] text-[#111827]">
              {title}
            </MLDialogTitle>
            <MLDialogDescription className="text-[14px] leading-[20px] text-[#6b7280]">
              {description}
            </MLDialogDescription>
          </MLDialogHeader>
          <MLTypography as="div" className="flex items-center justify-end gap-3 pt-2">
            <MLButton
              variant="outline"
              className="min-w-[110px] border-[#e6e6e6] text-[#111827] transition-colors"
              onClick={handleClose}
            >
              {cancelLabel}
            </MLButton>
            <MLButton
              variant={confirmVariant}
              className="min-w-[110px] transition-colors"
              onClick={handleConfirm}
              disabled={isConfirming}
            >
              {isConfirming && confirmingLabel ? confirmingLabel : confirmLabel}
            </MLButton>
          </MLTypography>
          {footerNote ? (
            <MLTypography as="div" className="pt-2 text-[12px] text-[#9ca3af]">
              {footerNote}
            </MLTypography>
          ) : null}
        </MLDialogContent>
      </MLDialog>
    );
  }
);

ConfirmDialog.displayName = "ConfirmDialog";

export default ConfirmDialog;
