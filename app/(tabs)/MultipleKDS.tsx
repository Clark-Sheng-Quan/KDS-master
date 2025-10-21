import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { theme } from "../../styles/theme";
export default function RecallScreen() {
  const [selectedStation, setSelectedStation] = useState("");

  return (
    <View style={styles.container}>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedStation}
          onValueChange={(itemValue) => setSelectedStation(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Select Station" value="" />
          <Picker.Item label="Station 1" value="station1" />
          <Picker.Item label="Station 2" value="station2" />
          <Picker.Item label="Station 3" value="station3" />
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.colors.backgroundColor,
  },
  pickerContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  picker: {
    height: 50,
    width: "100%",
  },
});
