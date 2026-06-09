export function Privacy() {
  return (
    <div class="privacy-wrap">
      <h2 class="privacy-title">隐私声明</h2>
      <p class="privacy-updated">最后更新：2025 年 1 月</p>

      <section class="privacy-section">
        <h3>我们收集什么</h3>
        <p>回响仅在您的设备本地收集和存储以下信息：</p>
        <ul>
          <li>您保存的网页 URL、标题、favicon 和保存时间</li>
          <li>您对内容做出的三向决策（留下来 / 用过了 / 放手）</li>
          <li>匿名化的操作事件（不含个人身份信息）</li>
          <li>私人注释的<strong>字数</strong>（注释内容本身永远不离开您的设备）</li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>我们不收集什么</h3>
        <ul>
          <li>私人注释的具体内容</li>
          <li>您的浏览历史或其他网页</li>
          <li>您的真实姓名、邮箱或任何身份信息</li>
          <li>第三方追踪数据</li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>数据存储与传输</h3>
        <p>
          选择「只存本地」时，所有数据仅保存在本设备的 <code>chrome.storage.local</code> 和
          IndexedDB 中，不发出任何网络请求（可通过浏览器 DevTools → Network 面板验证）。
        </p>
        <p>
          选择「云端同步」时，数据通过加密连接传输到我们的服务器（Supabase PostgreSQL）。
          私人注释内容即使在云端同步模式下也永远不上传。
        </p>
      </section>

      <section class="privacy-section">
        <h3>AI 功能</h3>
        <p>
          使用 AI 模式时，仅将文章<strong>标题和来源域名</strong>发送给您选择的 AI 服务商。
          您的 API Key 仅存储在本地，不经过回响服务器。完整 URL 和私人笔记不会发送给任何第三方。
        </p>
      </section>

      <section class="privacy-section">
        <h3>您的权利</h3>
        <p>您可以随时在「设置」页面：</p>
        <ul>
          <li>导出全部数据为 JSON 文件</li>
          <li>一键清空所有本地数据</li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>联系我们</h3>
        <p>如有隐私相关问题，请通过 GitHub Issues 与我们联系。</p>
      </section>
    </div>
  )
}
