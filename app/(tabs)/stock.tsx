import React from "react";
import { View, StyleSheet } from "react-native";
import StockManagementScreen from "../../components/StockManagement";

const stock = () => {
  return (
    <View style={styles.container}>
      <StockManagementScreen />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
  },
});
export default stock;
