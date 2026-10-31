# Sculpy app icon · 2026-10-31

Status: deployed. GitHub Pages workflow 41241445050 completed successfully for commit a54cda48b4ba3cfb0e674a261d11b6a2128249ed. URL: https://2ez4jz.github.io/sculp-database/.

The release record updates source product knowledge; the existing chat Edge Function was not redeployed for this icon-only release.

Replaced the simplified mark with a square icon adapted from the existing cream porcelain Sculpy sprite in assets/sculpy.webp. Generated with the built-in image tool, preserving the head curl, eyes, cheeks, body and warm beige background. Prompt: center the existing character in a square app icon, whole body visible, no text, border or new objects.

Updated 180px Apple touch icon, 192/512/1024px app icons, maskable 512px icon with additional safe padding, 64px browser favicon and legacy SVG entry. Both production and Demo manifests retain their existing identities and launch URLs. Installation dialog shares the updated artwork. Versioned URLs refresh cached assets.

Validation: PNG dimensions and opacity, both manifest asset references, unchanged installation identities/launch URLs, syntax and product-knowledge regression checks. No live business data changes or backend deployment. Existing iOS home-screen shortcuts may need removal and re-addition to refresh the icon.

## iOS follow-up

User reported a letter S after reinstalling. Live HTML and original PNG endpoints return 200, and repository PNG bytes match the intended sprite. Exact device-side cause is unconfirmed. Added a new filename for the explicitly declared iOS icon, truecolor RGB PNG encoding, project-absolute paths, and standard root fallback filenames. iPhone home-screen rendering still requires device confirmation.
