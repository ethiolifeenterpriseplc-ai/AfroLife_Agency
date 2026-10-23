$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceRoot = Join-Path $projectRoot 'android\app\src\main\res'
$publicIconRoot = Join-Path $projectRoot 'public\icons'
$green = [System.Drawing.Color]::FromArgb(0, 184, 90)
$blue = [System.Drawing.Color]::FromArgb(0, 102, 255)
$yellow = [System.Drawing.Color]::FromArgb(255, 176, 0)
$neutral = [System.Drawing.Color]::FromArgb(244, 246, 242)

function Draw-BrandMark($graphics, [float]$originX, [float]$originY, [float]$scale) {
  $greenBrush = [System.Drawing.SolidBrush]::new($green)
  $blueBrush = [System.Drawing.SolidBrush]::new($blue)
  $yellowBrush = [System.Drawing.SolidBrush]::new($yellow)
  $left = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $left.AddBezier($originX + 34.5 * $scale, $originY + 27.375 * $scale, $originX + 39.375 * $scale, $originY + 27.375 * $scale, $originX + 42.75 * $scale, $originY + 31.5 * $scale, $originX + 41.25 * $scale, $originY + 36.375 * $scale)
  $left.AddLine($originX + 41.25 * $scale, $originY + 36.375 * $scale, $originX + 32.25 * $scale, $originY + 66 * $scale)
  $left.AddBezier($originX + 32.25 * $scale, $originY + 66 * $scale, $originX + 30.375 * $scale, $originY + 72 * $scale, $originX + 24.75 * $scale, $originY + 74.625 * $scale, $originX + 19.875 * $scale, $originY + 73.5 * $scale)
  $left.AddBezier($originX + 19.875 * $scale, $originY + 73.5 * $scale, $originX + 15 * $scale, $originY + 72.375 * $scale, $originX + 13.125 * $scale, $originY + 67.125 * $scale, $originX + 14.875 * $scale, $originY + 62.625 * $scale)
  $left.AddLine($originX + 14.875 * $scale, $originY + 62.625 * $scale, $originX + 26.625 * $scale, $originY + 33.75 * $scale)
  $left.AddBezier($originX + 26.625 * $scale, $originY + 33.75 * $scale, $originX + 28.125 * $scale, $originY + 29.625 * $scale, $originX + 30.75 * $scale, $originY + 27.375 * $scale, $originX + 34.5 * $scale, $originY + 27.375 * $scale)
  $left.CloseFigure()
  $graphics.FillPath($greenBrush, $left)

  $right = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $right.AddBezier($originX + 61.5 * $scale, $originY + 27.375 * $scale, $originX + 56.625 * $scale, $originY + 27.375 * $scale, $originX + 53.25 * $scale, $originY + 31.5 * $scale, $originX + 54.75 * $scale, $originY + 36.375 * $scale)
  $right.AddLine($originX + 54.75 * $scale, $originY + 36.375 * $scale, $originX + 63.75 * $scale, $originY + 66 * $scale)
  $right.AddBezier($originX + 63.75 * $scale, $originY + 66 * $scale, $originX + 65.625 * $scale, $originY + 72 * $scale, $originX + 71.25 * $scale, $originY + 74.625 * $scale, $originX + 76.125 * $scale, $originY + 73.5 * $scale)
  $right.AddBezier($originX + 76.125 * $scale, $originY + 73.5 * $scale, $originX + 81 * $scale, $originY + 72.375 * $scale, $originX + 82.875 * $scale, $originY + 67.125 * $scale, $originX + 81.125 * $scale, $originY + 62.625 * $scale)
  $right.AddLine($originX + 81.125 * $scale, $originY + 62.625 * $scale, $originX + 69.375 * $scale, $originY + 33.75 * $scale)
  $right.AddBezier($originX + 69.375 * $scale, $originY + 33.75 * $scale, $originX + 67.875 * $scale, $originY + 29.625 * $scale, $originX + 65.25 * $scale, $originY + 27.375 * $scale, $originX + 61.5 * $scale, $originY + 27.375 * $scale)
  $right.CloseFigure()
  $graphics.FillPath($blueBrush, $right)

  $base = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $base.AddBezier($originX + 33.75 * $scale, $originY + 67.875 * $scale, $originX + 34.875 * $scale, $originY + 58.5 * $scale, $originX + 42 * $scale, $originY + 52.5 * $scale, $originX + 48 * $scale, $originY + 52.5 * $scale)
  $base.AddBezier($originX + 48 * $scale, $originY + 52.5 * $scale, $originX + 55.125 * $scale, $originY + 52.5 * $scale, $originX + 61.125 * $scale, $originY + 58.5 * $scale, $originX + 62.25 * $scale, $originY + 67.875 * $scale)
  $base.AddBezier($originX + 62.25 * $scale, $originY + 67.875 * $scale, $originX + 58.125 * $scale, $originY + 71.625 * $scale, $originX + 53.25 * $scale, $originY + 73.5 * $scale, $originX + 48 * $scale, $originY + 73.5 * $scale)
  $base.AddBezier($originX + 48 * $scale, $originY + 73.5 * $scale, $originX + 42.75 * $scale, $originY + 73.5 * $scale, $originX + 37.875 * $scale, $originY + 71.625 * $scale, $originX + 33.75 * $scale, $originY + 67.875 * $scale)
  $base.CloseFigure()
  $graphics.FillPath($yellowBrush, $base)
  $graphics.FillEllipse($yellowBrush, $originX + 40.875 * $scale, $originY + 15.75 * $scale, 14.25 * $scale, 14.25 * $scale)

  $greenBrush.Dispose()
  $blueBrush.Dispose()
  $yellowBrush.Dispose()
  $left.Dispose()
  $right.Dispose()
  $base.Dispose()
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

foreach ($density in @(
  @{ Name = 'mdpi'; Size = 48 }, @{ Name = 'hdpi'; Size = 72 },
  @{ Name = 'xhdpi'; Size = 96 }, @{ Name = 'xxhdpi'; Size = 144 }, @{ Name = 'xxxhdpi'; Size = 192 }
)) {
  foreach ($iconName in @('ic_launcher.png', 'ic_launcher_round.png')) {
    $bitmap = [System.Drawing.Bitmap]::new($density.Size, $density.Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $scale = $density.Size / 96.0
    Draw-BrandMark $graphics 0 0 $scale
    $graphics.Dispose()
    Save-Png $bitmap (Join-Path $resourceRoot "mipmap-$($density.Name)\$iconName")
  }

  $foregroundSize = [int]($density.Size * 2.25)
  $foreground = [System.Drawing.Bitmap]::new($foregroundSize, $foregroundSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($foreground)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $foregroundSize / 96.0 * 0.6875
  Draw-BrandMark $graphics (($foregroundSize / 2.0) - 48 * $scale) (($foregroundSize / 2.0) - 48 * $scale) $scale
  $graphics.Dispose()
  Save-Png $foreground (Join-Path $resourceRoot "mipmap-$($density.Name)\ic_launcher_foreground.png")
}

foreach ($file in Get-ChildItem -Path $resourceRoot -Recurse -Filter splash.png) {
  $original = [System.Drawing.Image]::FromFile($file.FullName)
  $width = $original.Width
  $height = $original.Height
  $original.Dispose()
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($neutral)
  $tileSize = [Math]::Min($width, $height) * 0.28
  $tileX = ($width - $tileSize) / 2.0
  $tileY = ($height - $tileSize) / 2.0
  $scale = $tileSize / 96.0
  Draw-BrandMark $graphics $tileX $tileY $scale
  $graphics.Dispose()
  Save-Png $bitmap $file.FullName
}

foreach ($size in @(192, 256, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $size / 96.0
  Draw-BrandMark $graphics 0 0 $scale
  $graphics.Dispose()
  Save-Png $bitmap (Join-Path $publicIconRoot "afrolife-icon-$size.png")
}

Write-Output 'Generated matching AfroLife PWA, Android launcher, adaptive foreground, and splash assets.'
