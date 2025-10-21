declare module 'react-native-charts-wrapper' {
  import { Component } from 'react';
  
  interface PieChartProps {
    style: any;
    data: any;
    legend?: any;
    highlights?: any[];
  }

  export class PieChart extends Component<PieChartProps> {}
} 