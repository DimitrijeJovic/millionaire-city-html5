# Fonts

The original Millionaire City user interface utilized commercial typefaces:
- **Challenge Bold LET**
- **Helvetica Rounded LT Std** (Bold, Bold Condensed, Black)
- **Arial / Arial Black**

Due to intellectual property protections and font redistribution licensing restrictions, raw `.ttf` font binaries are excluded from public repository distribution.

### Fallback Behavior
The web client references `@font-face` definitions declared in `fonts.css`. When local `.ttf` files are not present in this folder, modern browsers automatically fall back to equivalent system fonts (such as system Arial, Arial Black, or default sans-serif font families).

### Adding Original Fonts
If you own licensed copies or have extracted glyph outlines from legally obtained original assets, place the corresponding TrueType files in this directory:
- `Arial.ttf`
- `ArialBlack.ttf`
- `ChallengeBoldLET.ttf`
- `HelveticaRoundedLTStdBd.ttf`
- `HelveticaRoundedLTStdBdCn.ttf`
- `HelveticaRoundedLTStdBlk.ttf`
