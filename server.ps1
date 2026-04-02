$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running at http://localhost:8080/"
Write-Host "Press Ctrl+C to stop"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".zip"  = "application/zip"
}

$basePath = "C:\Users\LeChan\.gemini\antigravity\scratch\image-geotag-tool"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $localPath = $request.Url.LocalPath
    if ($localPath -eq "/") { $localPath = "/index.html" }
    
    $filePath = Join-Path $basePath ($localPath -replace "/", "\")
    
    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        
        $response.ContentType = $contentType
        $response.StatusCode = 200
        
        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $fileBytes.Length
        $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
        
        Write-Host "$($request.HttpMethod) $localPath -> 200"
    } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "$($request.HttpMethod) $localPath -> 404"
    }
    
    $response.Close()
}
