---
name: timber-admin
description: 当用户要开发 timber 项目的 admin 后台页面时触发，包含 Dashboard、商品管理、订单管理、库存管理。涉及 admin side 的任何开发任务都应触发。
---

# Timber Ecommerce — Admin 后台

## 设计风格
- 布局：左侧 sidebar（240px）+ 顶部 topbar（60px）+ 主内容区
- 主色：深棕 `#5C3D2E`（sidebar 背景）
- 内容区背景：`#F8F5F2`
- 卡片：白色 + 细边框

## Admin 布局模板
```html
<div class="admin-layout">
  <aside class="sidebar">
    <div class="sidebar-logo">🪵 Timber Admin</div>
    <nav class="sidebar-nav">
      <a href="index.html"     class="nav-item"><i>📊</i> Dashboard</a>
      <a href="products.html"  class="nav-item"><i>📦</i> Products</a>
      <a href="orders.html"    class="nav-item"><i>🧾</i> Orders</a>
      <a href="inventory.html" class="nav-item"><i>🏚</i> Inventory</a>
    </nav>
  </aside>
  <div class="admin-main">
    <header class="topbar">
      <h1 class="page-title">Dashboard</h1>
      <div class="topbar-right">Admin User</div>
    </header>
    <main class="content"><!-- 内容 --></main>
  </div>
</div>
```

```css
.admin-layout { display: flex; min-height: 100vh; }
.sidebar      { width: 240px; background: #5C3D2E; color: #F5EFE6; flex-shrink: 0; }
.sidebar-logo { padding: 20px; font-size: 18px; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,0.1); }
.nav-item     { display: flex; align-items: center; gap: 10px; padding: 12px 20px; color: rgba(255,255,255,0.8); text-decoration: none; font-size: 14px; }
.nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: #fff; }
.admin-main   { flex: 1; display: flex; flex-direction: column; }
.topbar       { height: 60px; background: #fff; border-bottom: 1px solid #DDD0C4; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; }
.content      { flex: 1; padding: 24px; background: #F8F5F2; }
```

## Dashboard — admin/index.html

### 统计卡片（4个）
```
今日访问量 | 本月订单数 | 本月营收(RM) | 待处理订单
```

### 图表（Chart.js）
- 折线图：过去 12 个月销售趋势
- 柱状图：本月各分类销售量
- 饼图：订单状态分布

```javascript
// 销售趋势图
const salesChart = new Chart(document.getElementById('salesChart'), {
  type: 'line',
  data: {
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    datasets: [{
      label: 'Revenue (RM)',
      data: [/* 从 API 或 mock 取 */],
      borderColor: '#C67C4E',
      backgroundColor: 'rgba(198,124,78,0.1)',
      tension: 0.4,
      fill: true
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  }
});
```

### Mock Dashboard 数据
```javascript
const DASHBOARD_DATA = {
  todayViews: 248,
  monthOrders: 63,
  monthRevenue: 12840.50,
  pendingOrders: 7,
  salesTrend: [8200, 9100, 7800, 10200, 11500, 9800, 12100, 10900, 13200, 11800, 12400, 12840],
  categoryStats: { Hardwood: 35, Softwood: 18, Plywood: 24, Treated: 21 },
  orderStatus: { pending: 7, confirmed: 12, shipped: 18, delivered: 24, cancelled: 2 }
};
```

## Products — admin/products.html

### 功能清单
- 表格：图片缩略图、名称、分类、价格、库存、状态 badge、操作按钮
- 搜索 + 分类筛选 + 状态筛选
- 新增/编辑商品 Modal（名称、分类、价格、单位、库存、描述、上传图片、状态）
- 上架/下架切换（不做真删除）
- 分页（每页 20 条）

### 商品表格行模板
```html
<tr>
  <td><img src="..." style="width:48px;height:48px;object-fit:cover;border-radius:4px"></td>
  <td>Meranti Plank</td>
  <td>Hardwood</td>
  <td>RM 45.00 / m</td>
  <td class="stock-cell">150</td>
  <td><span class="badge badge-active">Active</span></td>
  <td>
    <button onclick="editProduct(1)">Edit</button>
    <button onclick="toggleStatus(1)">Deactivate</button>
  </td>
</tr>
```

## Orders — admin/orders.html

### 功能清单
- 表格：订单号、客户名、金额、状态、日期、操作
- 筛选：状态筛选、日期范围
- 点击查看订单详情（Modal 展开明细）
- 更新订单状态（下拉选择）
- 状态流转：pending → confirmed → shipped → delivered

### 状态更新逻辑
```javascript
function updateOrderStatus(orderId, newStatus) {
  const validFlow = {
    pending:   ['confirmed', 'cancelled'],
    confirmed: ['shipped', 'cancelled'],
    shipped:   ['delivered'],
    delivered: [],
    cancelled: []
  };
  // 检查流转是否合法，再更新
}
```

## Inventory — admin/inventory.html

### 功能清单
- 表格：商品名、分类、当前库存、警示线、状态（正常/低库存/缺货）
- 低库存（stock <= min_stock）高亮红色行
- 手动调整库存（Modal：入库/出库数量 + 原因备注）
- 库存变动记录（按商品展开历史）

### 低库存样式
```css
.stock-low  { color: #C0392B; font-weight: 500; }
.row-low    { background: #FFF5F5; }
.row-normal { background: #fff; }
```

## 通用 Admin JS 工具
```javascript
// Modal 控制
const Modal = {
  open(id)  { document.getElementById(id).style.display = 'flex'; },
  close(id) { document.getElementById(id).style.display = 'none'; }
};

// 通用提示
const Toast = {
  show(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
};

// 分页
function paginate(items, page, perPage = 20) {
  const start = (page - 1) * perPage;
  return { data: items.slice(start, start + perPage), total: items.length, pages: Math.ceil(items.length / perPage) };
}
```
