/**
 * 触发浏览器下载一段 CSV 文本。
 * 前置 BOM 让 Excel 正确识别 UTF-8；morrigan 上传时会剥离 BOM 再校验表头，
 * 因此导出的失败行文件可以直接再次上传。
 */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()

  // 立刻 revoke 会在部分 WebKit/Safari 上取消尚未开始的下载，延后一拍再释放。
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
