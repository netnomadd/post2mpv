# Maintainer: Your Name <you@example.com>
pkgname=post2mpv-firefox
pkgver=1.0.0
pkgrel=1
pkgdesc="post2mpv Firefox extension (XPI) and native bridge"
arch=('x86_64')
url="https://github.com/netnomadd/post2mpv"
license=('custom')
makedepends=('go')
depends=()
source=("https://github.com/netnomadd/post2mpv/releases/download/v${pkgver}/v${pkgver}.xpi" "post2mpv-bridge.go")
sha256sums=('46ce33974751caa08962396ba7be32149223ee7fd73120b1e41a585c70dcccfc' 'SKIP')

build() {
  cd "$srcdir"
  go build -o post2mpv-bridge post2mpv-bridge.go
}

package() {
  install -Dm755 "$srcdir/post2mpv-bridge" "$pkgdir/usr/bin/post2mpv-bridge"
  install -Dm644 "$srcdir/v${pkgver}.xpi" "$pkgdir/usr/share/mozilla/extensions/post2mpv@netnom.uk.xpi"

  # generate system manifest for Firefox
  mkdir -p "$pkgdir/usr/lib/mozilla/native-messaging-hosts"
  "$pkgdir/usr/bin/post2mpv-bridge" --manifest > "$pkgdir/usr/lib/mozilla/native-messaging-hosts/post2mpv.json"
  chmod 644 "$pkgdir/usr/lib/mozilla/native-messaging-hosts/post2mpv.json"
}

