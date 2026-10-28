import { useState, type ElementType, type ComponentPropsWithoutRef } from 'react';
import { css } from '../../lib/css';

type BoxProps = {
  style: string;
  hover?: string;
  as?: ElementType;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
} & Omit<ComponentPropsWithoutRef<'div'>, 'style'>;

// ponytail: hover via state, not CSS classes - fine at this element count; move to a stylesheet if a list ever renders thousands of hoverable rows.
export function Box({ style, hover, as: Tag = 'div', ...rest }: BoxProps) {
  const [over, setOver] = useState(false);
  const merged = hover && over ? { ...css(style), ...css(hover) } : css(style);
  return (
    <Tag
      {...rest}
      style={merged}
      onMouseEnter={hover ? () => setOver(true) : rest.onMouseEnter}
      onMouseLeave={hover ? () => setOver(false) : rest.onMouseLeave}
    />
  );
}
