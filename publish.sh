#!/bin/bash

# 自动构建并发布 GitHub release 脚本
# 使用方式: 
#   1) 在脚本顶部手动填写 VERSION 和 RELEASE_NOTES
#   2) 运行 ./publish.sh

set -e

# ========================================
# 手动发布配置（每次发布前请更新）
# ========================================
VERSION="1.2.3"

RELEASE_NOTES=$(cat <<'EOF'
## Version 1.2.3

### Major Improvements
- Able to recieve table order
- add the start end time on the order details page

### Bug Fixes
- Clear waster Functions.

### Download
Get the latest APK from the Assets section below.
EOF
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}     KDS Release Publisher v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# 1. 获取并处理版本号
echo -e "\n${YELLOW}[1/8]${NC} 处理版本号..."

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}❌ VERSION 格式错误: $VERSION${NC}"
    echo -e "${YELLOW}请在脚本顶部使用格式: X.X.X (例如: 1.1.2)${NC}"
    exit 1
fi

# 从 app.json 读取当前版本
CURRENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' app.json | head -1 | cut -d'"' -f4)
if [ -z "$CURRENT_VERSION" ]; then
    echo -e "${RED}❌ 无法从 app.json 中读取版本号${NC}"
    exit 1
fi

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
    echo -e "${GREEN}✓${NC} app.json/package.json 版本已是 ${YELLOW}$VERSION${NC}"
else
    echo -e "${YELLOW}📝 准备更新版本:${NC}"
    echo -e "   当前版本: ${YELLOW}$CURRENT_VERSION${NC}"
    echo -e "   新版本: ${YELLOW}$VERSION${NC}"

    # 更新 app.json
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" app.json
    echo -e "${GREEN}✓${NC} app.json 已更新"

    # 更新 package.json
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" package.json
    echo -e "${GREEN}✓${NC} package.json 已更新"
fi

echo -e "${GREEN}✓${NC} 发布版本: ${YELLOW}$VERSION${NC}"

# 2. 提交版本号同步更改（如果有）
echo -e "\n${YELLOW}[2/8]${NC} 提交版本号更改..."
if [ -n "$(git status --porcelain | grep -E 'package.json|app.json')" ]; then
    echo -e "${YELLOW}  检测到版本号文件变更，正在提交...${NC}"
    git add app.json package.json
    git commit -m "chore: sync version to $VERSION"
    echo -e "${GREEN}✓${NC} 版本号更改已提交"
else
    echo -e "${GREEN}✓${NC} 版本号无需更新"
fi

# 3. 验证 git 状态
echo -e "\n${YELLOW}[3/8]${NC} 验证 git 状态..."
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠ 工作目录有未提交的更改，按配置继续发布${NC}"
    echo -e "${YELLOW}  注意: 本次 tag/release 基于当前 HEAD 提交，不会自动包含未提交改动${NC}"
else
    echo -e "${GREEN}✓${NC} 工作目录干净"
fi

# 4. 检查标签是否存在
echo -e "\n${YELLOW}[4/8]${NC} 检查 git 标签..."
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} 标签 v$VERSION 已存在，跳过创建标签"
    TAG_EXISTS=true
else
    echo -e "${GREEN}✓${NC} 标签 v$VERSION 不存在（可以创建）"
    TAG_EXISTS=false
fi

# 5. 跳过 APK 构建（使用本地已构建文件）
echo -e "\n${YELLOW}[5/8]${NC} 跳过 APK 构建（使用现有 APK）..."

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}❌ 找不到 APK 文件: $APK_PATH${NC}"
    echo -e "${YELLOW}请先手动构建 APK，再重新运行脚本${NC}"
    exit 1
fi

APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo -e "${GREEN}✓${NC} 使用已构建 APK (${YELLOW}$APK_SIZE${NC})"

# 6. 创建 git 标签和 GitHub release
echo -e "\n${YELLOW}[6/8]${NC} 创建 GitHub release..."

# 先推送当前分支，确保远端分支与本地最新 commit 同步
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$CURRENT_BRANCH"

if [ "$TAG_EXISTS" = true ]; then
    echo -e "${YELLOW}  标签已存在，跳过 tag 创建${NC}"

    if gh release view "v$VERSION" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Release v$VERSION 已存在，继续上传 APK"
    else
        gh release create "v$VERSION" \
            --title "Version $VERSION" \
            --notes "$RELEASE_NOTES" \
            --draft
        echo -e "${GREEN}✓${NC} Release v$VERSION 已创建（基于已有 tag）"
    fi
else
    # 创建 git 标签
    git tag "v$VERSION"
    git push origin "v$VERSION"

    # 创建 release（初始为 draft）
    gh release create "v$VERSION" \
        --title "Version $VERSION" \
        --notes "$RELEASE_NOTES" \
        --draft

    echo -e "${GREEN}✓${NC} Release v$VERSION 已创建（draft 状态）"
fi

# 7. 上传 APK 并发布
echo -e "\n${YELLOW}[7/8]${NC} 上传 APK 并发布..."

gh release upload "v$VERSION" "$APK_PATH" --clobber
gh release edit "v$VERSION" --draft=false

echo -e "${GREEN}✓${NC} APK 已上传并发布"

echo -e "\n${YELLOW}[8/8]${NC} 完成...\n"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     ✓ 发布完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n📦 Release 详情:"
echo -e "   版本: ${YELLOW}v$VERSION${NC}"
echo -e "   APK: ${YELLOW}$APK_SIZE${NC}"
echo -e "   链接: ${BLUE}https://github.com/Clark-Sheng-Quan/KDS-master/releases/tag/v$VERSION${NC}"
echo -e "\n✓ 用户可以从 GitHub release 页面下载 APK"
echo -e ""
