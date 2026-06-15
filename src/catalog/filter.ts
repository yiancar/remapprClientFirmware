// Pattern check: no GoF pattern (-) — rejected — pure filter helper applying codec.supports across catalog pages, no abstraction.
import type { KeycodeCodec } from '../codec'
import { CATALOG_PAGES } from './pages'
import type { KeyCatalog } from './types'

export const filterCatalogByCodec = (codec: KeycodeCodec): KeyCatalog => ({
    pages: CATALOG_PAGES.map((page) => ({
        ...page,
        entries: page.entries.filter((e) => codec.supports(e.id)),
    })).filter((p) => p.entries.length > 0),
})
