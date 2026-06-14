import { Link } from '@chakra-ui/react'

// Lightly obfuscated email so the plain address (and a `mailto:`) never appears in
// the static bundle for naive scrapers. The address is base64-encoded and only
// decoded at runtime; the mailto href is built on click rather than rendered.
const ENCODED = 'bWFpbEB0amVya3dvdWRzbWEuY29t'

export function ObfuscatedEmail() {
  const address = atob(ENCODED)
  return (
    <Link
      href="#"
      color="brand.500"
      onClick={(e) => {
        e.preventDefault()
        const subject = encodeURIComponent('sirenes.live question')
        window.location.href = `mailto:${address}?subject=${subject}`
      }}
    >
      email
    </Link>
  )
}
