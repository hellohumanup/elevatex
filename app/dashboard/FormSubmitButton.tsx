"use client";

import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  idleText: string;
  pendingText: string;
};

export default function FormSubmitButton({
  idleText,
  pendingText,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? pendingText : idleText}
    </button>
  );
}
