import type { TvBrand } from '../data/brand-guides';
import type { Locale } from '../data';
import { Icon } from '../ui/Icon';
import { BRAND_COPY } from './brand-strings';
import './brands.css';

export function BrandTiles({ brands, locale, compact = false, verifiedCounts }: {
  brands: readonly TvBrand[]; locale: Locale; compact?: boolean; verifiedCounts?: ReadonlyMap<string, number>;
}) {
  return <ul className={'brand-tiles' + (compact ? ' compact' : '')}>
    {brands.map(brand => <li key={brand.id}>
      <a className="brand-tile" href={`?flow=presets&brand=${brand.id}&lang=${locale}`}>
        <strong>{brand.name}</strong>
        {!compact && <span className="brand-tile-count">{BRAND_COPY[locale].guides} · {brand.guides.length + (verifiedCounts?.get(brand.name) ?? 0)}</span>}
        <Icon name="arrow" />
      </a>
    </li>)}
  </ul>;
}

export function ManufacturerGuides({ brand, locale }: { brand: TvBrand; locale: Locale }) {
  const copy = BRAND_COPY[locale];
  return <section className="brand-resource-list" aria-labelledby="manufacturer-title">
    <header><h2 id="manufacturer-title">{copy.support}</h2><p>{copy.supportHint}</p></header>
    {brand.guides.map(guide => <details className="brand-resource" key={guide.title}>
      <summary>
        <span className="icon-tile"><Icon name="guide" /></span>
        <span><strong>{copy[guide.title]}</strong>{guide.model && <small>{guide.model}</small>}</span>
        <span className="resource-chevron" aria-hidden="true" />
      </summary>
      <div className="brand-resource-body">
        <ol>{guide.steps.map(step => <li key={step}>{copy[step]}</li>)}</ol>
        <a className="manufacturer-source" href={guide.source}>{copy.source}<Icon name="open" /></a>
      </div>
    </details>)}
  </section>;
}
