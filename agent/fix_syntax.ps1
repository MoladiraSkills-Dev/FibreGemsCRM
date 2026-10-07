$path = "c:\Users\User\Downloads\static\FibreGemsCRM\agent\agent.js"
$content = [System.IO.File]::ReadAllText($path)

# First issue
$old1 = "    return ```r`n      const cStr = encodeURIComponent(JSON.stringify(c));`r`n      return ```<div"
$new1 = "    const cStr = encodeURIComponent(JSON.stringify(c));`r`n    return ```r`n      <div"
$content = $content.Replace($old1, $new1)

# Second issue
$old2 = "      return ```r`n      const cStr = encodeURIComponent(JSON.stringify(c));`r`n      return ```<tr"
$new2 = "      const cStr = encodeURIComponent(JSON.stringify(c));`r`n      return ```r`n      <tr"
$content = $content.Replace($old2, $new2)

# Fix openLeadDetail parameter passing
$content = $content.Replace("onclick=""openLeadDetail('')""", "onclick=""openLeadDetail('`${cStr}')""")

[System.IO.File]::WriteAllText($path, $content)
