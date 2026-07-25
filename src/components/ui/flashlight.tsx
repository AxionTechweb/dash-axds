"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Efeito "lanterna" da referência: um brilho radial que acompanha o cursor
 * dentro do elemento.
 *
 * O handler é local (não há listener global de mousemove) e só escreve duas
 * custom properties CSS no próprio nó — nada de state, então não provoca
 * re-render do React a cada pixel. Quem desenha é o `.flashlight::after`.
 */
export function Flashlight({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    target.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      className={cn("flashlight", className)}
      onMouseMove={handleMouseMove}
      {...props}
    >
      {children}
    </div>
  );
}
