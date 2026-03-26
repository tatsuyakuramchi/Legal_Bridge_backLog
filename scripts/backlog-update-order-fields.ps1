$ErrorActionPreference = "Stop"

if (-not $env:BACKLOG_SPACE) { throw "BACKLOG_SPACE is not set." }
if (-not $env:BACKLOG_PROJECT_ID) { throw "BACKLOG_PROJECT_ID is not set." }
if (-not $env:BACKLOG_API_KEY) { throw "BACKLOG_API_KEY is not set." }

$space = $env:BACKLOG_SPACE.Trim()
$projectId = $env:BACKLOG_PROJECT_ID.Trim()
$apiKey = $env:BACKLOG_API_KEY.Trim()

if ($space -match "^https?://") {
  $baseUrl = $space.TrimEnd("/")
} else {
  $baseUrl = "https://$space.backlog.com"
}

function Get-BacklogIssueTypes {
  $url = "$baseUrl/api/v2/projects/$([uri]::EscapeDataString($projectId))/issueTypes?apiKey=$([uri]::EscapeDataString($apiKey))"
  Invoke-RestMethod -Method Get -Uri $url
}

function Get-BacklogCustomFields {
  $url = "$baseUrl/api/v2/projects/$([uri]::EscapeDataString($projectId))/customFields?apiKey=$([uri]::EscapeDataString($apiKey))"
  Invoke-RestMethod -Method Get -Uri $url
}

function Add-BacklogCustomField {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$TypeId,
    [Parameter(Mandatory = $true)][string]$Description,
    [Parameter(Mandatory = $true)][bool]$Required,
    [Parameter(Mandatory = $true)][int[]]$ApplicableIssueTypeIds
  )

  $url = "$baseUrl/api/v2/projects/$([uri]::EscapeDataString($projectId))/customFields?apiKey=$([uri]::EscapeDataString($apiKey))"
  $body = @{
    name = $Name
    typeId = "$TypeId"
    description = $Description
    required = $(if ($Required) { "true" } else { "false" })
  }

  $i = 0
  foreach ($id in $ApplicableIssueTypeIds) {
    $body["applicableIssueTypes[$i]"] = "$id"
    $i += 1
  }

  Invoke-RestMethod -Method Post -Uri $url -Body $body -ContentType "application/x-www-form-urlencoded; charset=utf-8"
}

function Update-BacklogCustomFieldDescription {
  param(
    [Parameter(Mandatory = $true)][int]$FieldId,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $url = "$baseUrl/api/v2/projects/$([uri]::EscapeDataString($projectId))/customFields/$FieldId?apiKey=$([uri]::EscapeDataString($apiKey))"
  $body = @{
    description = $Description
  }

  Invoke-RestMethod -Method Patch -Uri $url -Body $body -ContentType "application/x-www-form-urlencoded; charset=utf-8"
}

$issueTypeMap = @{}
foreach ($issueType in (Get-BacklogIssueTypes)) {
  $issueTypeMap[$issueType.name] = [int]$issueType.id
}

$orderIssueTypeIds = @(
  $issueTypeMap["発注書"]
  $issueTypeMap["企画発注書"]
) | Where-Object { $_ }

if ($orderIssueTypeIds.Count -ne 2) {
  throw "Issue types for order templates could not be resolved."
}

$fieldMap = @{}
foreach ($field in (Get-BacklogCustomFields)) {
  $fieldMap[$field.name] = $field
}

$fieldsToAdd = @(
  @{
    name = "contract_period"
    typeId = 2
    description = "契約期間"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "work_start_date"
    typeId = 4
    description = "作業開始日"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "remarks_free"
    typeId = 2
    description = "備考自由記載"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "show_order_sign_section"
    typeId = 7
    description = "発注書署名欄表示"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "staff_name"
    typeId = 1
    description = "自社担当者名"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "staff_email"
    typeId = 1
    description = "自社担当者メール"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
  @{
    name = "staff_phone"
    typeId = 1
    description = "自社担当者電話番号"
    required = $false
    issueTypeIds = $orderIssueTypeIds
  }
)

Write-Host "Project: $projectId"
Write-Host "BaseUrl: $baseUrl"
Write-Host ""
Write-Host "=== Add missing order fields ==="

foreach ($spec in $fieldsToAdd) {
  if ($fieldMap.ContainsKey($spec.name)) {
    Write-Host "SKIP exists: $($spec.name)"
    continue
  }

  $created = Add-BacklogCustomField `
    -Name $spec.name `
    -TypeId $spec.typeId `
    -Description $spec.description `
    -Required $spec.required `
    -ApplicableIssueTypeIds $spec.issueTypeIds

  Write-Host "ADD: $($created.name)"
}

$fieldMap = @{}
foreach ($field in (Get-BacklogCustomFields)) {
  $fieldMap[$field.name] = $field
}

$fieldsToPatch = @(
  @{
    name = "accept_by_performance"
    description = "着手をもって承諾"
  }
  @{
    name = "accept_required"
    description = "承諾書面要否"
  }
  @{
    name = "show_sign_section"
    description = "受領署名欄表示"
  }
  @{
    name = "vendor_accept_type"
    description = "受領方法"
  }
)

Write-Host ""
Write-Host "=== Patch descriptions for existing order fields ==="

foreach ($spec in $fieldsToPatch) {
  if (-not $fieldMap.ContainsKey($spec.name)) {
    Write-Host "SKIP missing for patch: $($spec.name)"
    continue
  }

  Update-BacklogCustomFieldDescription -FieldId ([int]$fieldMap[$spec.name].id) -Description $spec.description
  Write-Host "PATCH: $($spec.name) -> $($spec.description)"
}

Write-Host ""
Write-Host "Done."
