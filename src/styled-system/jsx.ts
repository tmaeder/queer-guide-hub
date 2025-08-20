/* eslint-disable */
import type { ComponentPropsWithoutRef, ElementType, JSX } from 'react'
import { createElement, forwardRef } from 'react'

export interface StyledComponent<T extends ElementType> {
  (props: ComponentPropsWithoutRef<T>): JSX.Element
  displayName?: string
}

export function styled<T extends ElementType>(
  element: T,
  recipe?: any
): StyledComponent<T> {
  const StyledElement = forwardRef((props: any, ref) => {
    return createElement(element, { ...props, ref })
  }) as StyledComponent<T>

  return StyledElement
}