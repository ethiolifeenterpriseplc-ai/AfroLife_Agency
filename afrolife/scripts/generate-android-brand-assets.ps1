$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceRoot = Join-Path $projectRoot 'android\app\src\main\res'
$publicIconRoot = Join-Path $projectRoot 'public\icons'
$green = [System.Drawing.Color]::FromArgb(23, 75, 61)
$gold = [System.Drawing.Color]::FromArgb(215, 173, 89)
$white = [System.Drawing.Color]::White
$neutral = [System.Drawing.Color]::FromArgb(244, 246, 242)

function Fill-RoundedRectangle($graphics, $brush, [float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $diameter = 2 * $radius
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $graphics.FillPath($brush, $path)
  $path.Dispose()
}

function Draw-OpportunityMark($graphics, [float]$originX, [float]$originY, [float]$scale) {
  $connectorPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(232, 241, 233), 4 * $scale)
  $connectorPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $connectorPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $nodeBrush = [System.Drawing.SolidBrush]::new($white)
  $personBrush = [System.Drawing.SolidBrush]::new($green)
  $goldBrush = [System.Drawing.SolidBrush]::new($gold)
  $whiteBrush = [System.Drawing.SolidBrush]::new($white)

  $graphics.DrawLine($connectorPen, $originX + 43 * $scale, $originY + 44 * $scale, $originX + 32 * $scale, $originY + 35 * $scale)
  $graphics.DrawLine($connectorPen, $originX + 53 * $scale, $originY + 44 * $scale, $originX + 64 * $scale, $originY + 35 * $scale)
  $graphics.DrawLine($connectorPen, $originX + 48 * $scale, $originY + 56 * $scale, $originX + 48 * $scale, $originY + 63 * $scale)

  foreach ($node in @(@{ X = 25; Y = 27 }, @{ X = 71; Y = 27 }, @{ X = 48; Y = 75 })) {
    $x = $originX + $node.X * $scale
    $y = $originY + $node.Y * $scale
    $radius = 12 * $scale
    $graphics.FillEllipse($nodeBrush, $x - $radius, $y - $radius, 2 * $radius, 2 * $radius)
    $graphics.FillEllipse($personBrush, $x - 2.7 * $scale, $y - 6 * $scale, 5.4 * $scale, 5.4 * $scale)
    $personPen = [System.Drawing.Pen]::new($green, 2.4 * $scale)
    $graphics.DrawArc($personPen, $x - 6 * $scale, $y - 1 * $scale, 12 * $scale, 9 * $scale, 180, 180)
    $personPen.Dispose()
  }

  $graphics.FillEllipse($goldBrush, $originX + 40 * $scale, $originY + 41 * $scale, 16 * $scale, 16 * $scale)
  $graphics.FillEllipse($whiteBrush, $originX + 45.5 * $scale, $originY + 46.5 * $scale, 5 * $scale, 5 * $scale)
  $connectorPen.Dispose()
  $nodeBrush.Dispose()
  $personBrush.Dispose()
  $goldBrush.Dispose()
  $whiteBrush.Dispose()
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
    $background = [System.Drawing.SolidBrush]::new($green)
    Fill-RoundedRectangle $graphics $background 0 0 $density.Size $density.Size (20 * $scale)
    Draw-OpportunityMark $graphics 0 0 $scale
    $background.Dispose()
    $graphics.Dispose()
    Save-Png $bitmap (Join-Path $resourceRoot "mipmap-$($density.Name)\$iconName")
  }

  $foregroundSize = [int]($density.Size * 2.25)
  $foreground = [System.Drawing.Bitmap]::new($foregroundSize, $foregroundSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($foreground)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $foregroundSize / 96.0 * 0.6875
  Draw-OpportunityMark $graphics (($foregroundSize / 2.0) - 48 * $scale) (($foregroundSize / 2.0) - 48 * $scale) $scale
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
  $background = [System.Drawing.SolidBrush]::new($green)
  Fill-RoundedRectangle $graphics $background $tileX $tileY $tileSize $tileSize (20 * $scale)
  Draw-OpportunityMark $graphics $tileX $tileY $scale
  $background.Dispose()
  $graphics.Dispose()
  Save-Png $bitmap $file.FullName
}

foreach ($size in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($green)
  $scale = $size / 96.0
  Draw-OpportunityMark $graphics 0 0 $scale
  $graphics.Dispose()
  Save-Png $bitmap (Join-Path $publicIconRoot "icon-$size.png")

  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($green)
  Draw-OpportunityMark $graphics 0 0 $scale
  $graphics.Dispose()
  Save-Png $bitmap (Join-Path $publicIconRoot "ethio-life-icon-$size.png")
}

Write-Output 'Generated matching EthioLife PWA, Android launcher, adaptive foreground, and splash assets.'
