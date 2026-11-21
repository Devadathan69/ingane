import type { Ref } from 'react';

const paths = {
  library: 'M3 5h18v13H3zM8 21h8m-4-3v3',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  family: 'M20.3 4.7a5.2 5.2 0 0 0-7.4.2l-.9 1-.9-1a5.2 5.2 0 0 0-7.4-.2c-2.2 2.1-2.1 5.6-.1 8L12 21l8.4-8.3c2-2.4 2.1-5.9-.1-8Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  open: 'M5 19 18 6M7 6h11v11',
  back: 'M20 12H4m6-6-6 6 6 6',
  repeat: 'M3 9a9 9 0 1 1 .8 8M3 3v6h6',
  lock: 'M5 10h14v11H5zm3 0V7a4 4 0 0 1 8 0v3',
  edit: 'm4 16-1 5 5-1L20 8l-4-4zm10-10 4 4',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-2 5 6 6',
  mic: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8',
  file: 'M5 3h10l4 4v14H5zm9 0v5h5M8 12h8m-8 4h6',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="ui-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function FlowHeading({ icon, title, description, headingRef }: {
  icon: keyof typeof paths; title: string; description?: string; headingRef?: Ref<HTMLHeadingElement>;
}) {
  return <header className="flow-heading">
    <span className="icon-tile"><Icon name={icon} /></span>
    <div><h1 ref={headingRef} tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>
  </header>;
}
