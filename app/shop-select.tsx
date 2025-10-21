import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../contexts/LanguageContext";
import { getToken, auth } from "../utils/auth";
import { BASE_API } from "../config/api";
interface Shop {
  _id: string;
  name: string;
  shop_key: string;
  description: string;
}

export default function ShopSelectScreen() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      if (!token) {
        Alert.alert(t("error"), t("unauthorizedError"));
        router.replace("/login" as any);
        return;
      }

      const response = await fetch(`${BASE_API}/shop/list_shop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.status_code === 200 && data.shops) {
        setShops(data.shops);
      } else {
        Alert.alert(t("error"), t("shopSelectError"));
      }
    } catch (error) {
      console.error("获取店铺列表失败:", error);
      Alert.alert(t("error"), t("shopSelectError"));
    } finally {
      setLoading(false);
    }
  };

  const selectShop = async (shop: Shop) => {
    try {
      // 保存选中的店铺信息到 AsyncStorage
      await AsyncStorage.setItem("selectedShopId", shop._id);
      await AsyncStorage.setItem("selectedShopName", shop.name);
      await AsyncStorage.setItem("selectedShopKey", shop.shop_key);

      // 跳转到首页
      router.replace("/(tabs)/home" as any);
    } catch (error) {
      console.error("保存店铺信息失败:", error);
      Alert.alert(t("error"), t("saveShopFailed"));
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>{t("loadingShops")}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("selectShop")}</Text>

      {shops.length === 0 ? (
        <Text style={styles.noShopsText}>{t("noShopsAvailable")}</Text>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.shopItem}
              onPress={() => selectShop(item)}
            >
              <Text style={styles.shopName}>{item.name}</Text>
              <Text style={styles.shopDescription}>
                {item.description || t("shopDescription")}
              </Text>
              <Text style={styles.shopKey}>
                {t("shopCode")}: {item.shop_key}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
      <TouchableOpacity
        style={[
          styles.refreshButton,
          { backgroundColor: "#e74c3c", marginBottom: 10 },
        ]}
        onPress={async () => {
          await auth.logout();
          router.replace("/login" as any);
        }}
      >
        <Text style={styles.refreshButtonText}>{t("logout") || "Relogin"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.refreshButton} onPress={fetchShops}>
        <Text style={styles.refreshButtonText}>{t("refreshList")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  list: {
    paddingBottom: 20,
  },
  shopItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shopName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  shopDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  shopKey: {
    fontSize: 12,
    color: "#888",
  },
  noShopsText: {
    textAlign: "center",
    fontSize: 16,
    color: "#666",
    marginTop: 30,
  },
  refreshButton: {
    backgroundColor: "#0066cc",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    width: "20%",
    alignSelf: "center",
  },
  refreshButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
