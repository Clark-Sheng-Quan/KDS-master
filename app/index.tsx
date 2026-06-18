import { Redirect } from "expo-router";
import { useState, useEffect } from "react";
import { auth } from "../utils/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasSelectedShop, setHasSelectedShop] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authStatus = await auth.isAuthenticated();
        setIsAuthenticated(authStatus);

        if (authStatus) {
          // 如果已登录，检查是否选择了店铺（也加重试，防止队列繁忙）
          let shopId: string | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              shopId = await AsyncStorage.getItem("selectedShopId");
              break;
            } catch {
              if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
            }
          }
          setHasSelectedShop(!!shopId);
        }
      } catch (error) {
        console.error("认证检查失败:", error);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  if (
    isAuthenticated === null ||
    (isAuthenticated && hasSelectedShop === null)
  ) {
    // 还没检查完，就先返回个空或者 Loading
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  // 已登录但未选择店铺，使用类型断言解决类型问题
  if (!hasSelectedShop) {
    return <Redirect href={"/shop-select" as any} />;
  }

  // 已登录且已选择店铺
  return <Redirect href="/(tabs)/home" />;
}
