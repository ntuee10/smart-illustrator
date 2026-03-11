# TikZ 图表规范（Smart Illustrator 用）

生成 TikZ 图表时必须遵循此规范。TikZ 是 LaTeX 文档中最常用的绘图宏包，输出为可在 LaTeX 文件中直接使用的矢量图形（.tex 文件）。

---

## 什么时候用 TikZ

在用户明确要求 `--engine tikz` 或 LaTeX/TikZ 输出时使用。TikZ 输出的是 **文本格式的 .tex 文件**，不是图片，适合：

- LaTeX 文档（论文、书籍、讲义）
- 需要无损缩放的矢量图
- 需要与 LaTeX 数学公式融合的图表
- 需要版本控制的图形源文件

---

## 输出流程

1. 生成 TikZ 代码，保存为临时 `.tikz` 文件（纯代码，不含 `\documentclass`）
2. 调用 `tikz-export.ts` 将其封装为完整的独立 LaTeX 文档：

```bash
npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts \
  -i {图表名}.tikz -o {图表名}.tex
```

3. 若需要 PDF：

```bash
npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts \
  -i {图表名}.tikz -o {图表名}.pdf --compile
```

4. 若需要 PNG（同时生成 .tex 和 .png）：

```bash
npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts \
  -i {图表名}.tikz -o {图表名}.png --compile --png
```

5. 在文章中引用：
   - LaTeX 文档：`\input{diagram.tex}` 或 `\includegraphics{diagram.pdf}`
   - Markdown：`![diagram](diagram.png)`

---

## TikZ 代码规范

### 1. 输入格式（.tikz 文件内容）

提供的代码可以是：

**选项 A：纯绘图命令（推荐）**
```
\draw[->] (0,0) -- (2,0) node[right] {$x$};
\draw[->] (0,0) -- (0,2) node[above] {$y$};
\draw[thick,blue] (0,0) circle (1);
```

**选项 B：完整的 tikzpicture 环境**
```
\begin{tikzpicture}[scale=1.5]
  \draw[->] (0,0) -- (2,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
\end{tikzpicture}
```

脚本会自动检测是否已包含 `\begin{tikzpicture}`，避免重复包裹。

---

### 2. 节点样式（Node Styles）

使用 `\tikzstyle` 或 `\tikzset` 定义可复用样式：

```latex
\tikzset{
  block/.style = {rectangle, draw, fill=blue!20, 
                  text width=5em, text centered, rounded corners, minimum height=3em},
  line/.style  = {draw, -latex},
  cloud/.style = {draw, ellipse, fill=red!20, minimum height=2em}
}
```

**语义色板**（与 Mermaid 引擎保持一致）：

| 语义 | 填充色 | 边框色 | 用于 |
|------|--------|--------|------|
| input | `green!20` / `#d3f9d8` | `green!60!black` | 输入、起点、数据源 |
| process | `violet!20` / `#e5dbff` | `violet!70!black` | 处理、推理、核心逻辑 |
| decision | `red!20` / `#ffe3e3` | `red!70!black` | 决策点、分支判断 |
| action | `orange!20` / `#ffe8cc` | `orange!70!black` | 执行动作、工具调用 |
| output | `cyan!20` / `#c5f6fa` | `cyan!70!black` | 输出、结果、终点 |
| storage | `yellow!20` / `#fff4e6` | `yellow!70!black` | 存储、记忆、数据库 |
| meta | `blue!10` / `#e7f5ff` | `blue!60!black` | 标题、分组、元信息 |

---

### 3. 流程图模板

```latex
\begin{tikzpicture}[node distance=2cm, auto]
  % 定义样式
  \tikzset{
    startstop/.style = {rectangle, rounded corners, draw=black, fill=green!20,
                        minimum width=3cm, minimum height=1cm, text centered},
    process/.style   = {rectangle, draw=violet!70!black, fill=violet!20,
                        minimum width=3cm, minimum height=1cm, text centered},
    decision/.style  = {diamond, draw=red!70!black, fill=red!20, aspect=2,
                        minimum width=3cm, minimum height=1cm, text centered},
    arrow/.style     = {->, >=stealth, thick}
  }

  % 节点
  \node[startstop] (start)  {开始};
  \node[process]   (proc1)  [below of=start]  {处理步骤};
  \node[decision]  (dec1)   [below of=proc1]  {判断条件？};
  \node[process]   (proc2)  [below left of=dec1, xshift=-1cm] {分支 A};
  \node[process]   (proc3)  [below right of=dec1, xshift=1cm] {分支 B};
  \node[startstop] (stop)   [below of=dec1, yshift=-2.5cm]   {结束};

  % 连线
  \draw[arrow] (start)  -- (proc1);
  \draw[arrow] (proc1)  -- (dec1);
  \draw[arrow] (dec1)   -| node[near start, above] {是} (proc2);
  \draw[arrow] (dec1)   -| node[near start, above] {否} (proc3);
  \draw[arrow] (proc2)  |- (stop);
  \draw[arrow] (proc3)  |- (stop);
\end{tikzpicture}
```

---

### 4. 思维导图模板（使用 mindmap 库）

```latex
\begin{tikzpicture}[
  mindmap,
  grow cyclic,
  every node/.style=concept,
  concept color=blue!40,
  level 1/.append style={level distance=4.5cm, sibling angle=90},
  level 2/.append style={level distance=3cm, sibling angle=45}
]
  \node {核心概念}
    child [concept color=green!50!black] {
      node {子主题 1}
      child { node {细节 A} }
      child { node {细节 B} }
    }
    child [concept color=red!60] {
      node {子主题 2}
      child { node {细节 C} }
    }
    child [concept color=orange!80] {
      node {子主题 3}
    };
\end{tikzpicture}
```

---

### 5. 时序图模板（使用 arrows.meta 库）

```latex
\begin{tikzpicture}[
  actor/.style={rectangle, draw, minimum width=1.5cm, minimum height=0.8cm, fill=blue!10},
  msg/.style={->, >=stealth, thick}
]
  % 参与者
  \node[actor] (A) at (0,0)  {客户端};
  \node[actor] (B) at (4,0)  {服务器};
  \node[actor] (C) at (8,0)  {数据库};

  % 生命线
  \draw[dashed] (A) -- +(0,-6);
  \draw[dashed] (B) -- +(0,-6);
  \draw[dashed] (C) -- +(0,-6);

  % 消息
  \draw[msg] (0,-1) -- (4,-1) node[midway, above] {请求};
  \draw[msg] (4,-2) -- (8,-2) node[midway, above] {查询};
  \draw[msg] (8,-3) -- (4,-3) node[midway, above] {数据};
  \draw[msg] (4,-4) -- (0,-4) node[midway, above] {响应};
\end{tikzpicture}
```

---

### 6. 架构图模板（使用 fit 和 backgrounds 库）

```latex
\begin{tikzpicture}[
  box/.style={rectangle, draw, rounded corners, minimum width=2cm, minimum height=1cm,
              text centered, fill=white},
  arrow/.style={->, >=stealth}
]
  % 组件
  \node[box, fill=blue!10]  (frontend) at (0,0)   {前端};
  \node[box, fill=green!10] (backend)  at (4,0)   {后端 API};
  \node[box, fill=orange!10](db)       at (8,0)   {数据库};
  \node[box, fill=red!10]   (cache)    at (4,-2)  {缓存};

  % 连接
  \draw[arrow] (frontend) -- (backend) node[midway,above] {HTTP};
  \draw[arrow] (backend)  -- (db)      node[midway,above] {SQL};
  \draw[arrow] (backend)  -- (cache)   node[midway,right] {Redis};

  % 分组框（需要 backgrounds 库）
  \begin{scope}[on background layer]
    \node[draw=gray, dashed, rounded corners, inner sep=8pt,
          fit=(backend)(cache), label=above:服务层] {};
  \end{scope}
\end{tikzpicture}
```

---

## 布局规则

- **坐标系**：TikZ 使用笛卡尔坐标，单位默认为 cm
- **节点定位**：使用 `positioning` 库的 `above of`、`below of`、`right of`、`left of`
- **路径类型**：
  - `--` 直线
  - `-|` 先水平后垂直
  - `|-` 先垂直后水平
  - `..controls (cp1) and (cp2)..` 贝塞尔曲线
  - `arc` 圆弧
- **箭头**：`->` 单向 / `<->` 双向 / `->>` 双箭头头 / `>->` 使用 `>=stealth` 样式
- **文字大小**：使用 `\small`、`\footnotesize`、`\scriptsize` 控制节点内文字大小
- **节点数量**：单图 ≤ 15 个节点，复杂内容拆成多图

---

## 常用 TikZ 库

| 库名 | 用途 |
|------|------|
| `shapes` | 更多节点形状（菱形、云形等） |
| `arrows.meta` | 现代箭头样式 |
| `positioning` | 相对定位（`above of` 等） |
| `calc` | 坐标计算 |
| `fit` | 用框包围多个节点 |
| `backgrounds` | 背景层绘图 |
| `mindmap` | 思维导图 |
| `trees` | 树形布局 |
| `matrix` | 矩阵排列 |
| `decorations.pathreplacing` | 花括号等装饰 |
| `decorations.markings` | 路径上添加标记 |
| `pgfplots` | 数学函数图 / 数据图表 |
| `circuits.ee.IEC` | 电路图 |
| `3d` | 三维坐标系 |

如需使用标准库以外的库，通过 `--libraries` 参数传入：

```bash
npx -y bun tikz-export.ts -i circuit.tikz -o circuit.tex -l "circuits.ee.IEC"
```

---

## 在 LaTeX 文档中使用输出

### 方式一：直接引用 .tex（源码内联，矢量）

```latex
\usepackage{tikz}
\usetikzlibrary{shapes,arrows.meta,positioning}

\begin{document}
  \begin{figure}[h]
    \centering
    \input{diagram.tex}   % 引用独立 .tex 文件
    \caption{流程图示例}
  \end{figure}
\end{document}
```

### 方式二：引用 .pdf（编译后，矢量）

```latex
\usepackage{graphicx}

\begin{document}
  \begin{figure}[h]
    \centering
    \includegraphics[width=0.8\textwidth]{diagram.pdf}
    \caption{流程图示例}
  \end{figure}
\end{document}
```

### 方式三：引用 .png（编译后，栅格）

```latex
\usepackage{graphicx}

\begin{document}
  \begin{figure}[h]
    \centering
    \includegraphics[width=0.8\textwidth]{diagram.png}
    \caption{流程图示例}
  \end{figure}
\end{document}
```

---

## 文件命名约定

| 文件 | 说明 |
|------|------|
| `{文章名}-tikz-01.tikz` | TikZ 源代码（可编辑） |
| `{文章名}-tikz-01.tex` | 封装后的完整 LaTeX 文档 |
| `{文章名}-tikz-01.pdf` | 编译后的 PDF（矢量） |
| `{文章名}-tikz-01.png` | 转换后的 PNG（300 dpi） |
