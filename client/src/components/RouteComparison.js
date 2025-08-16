import React, { useState } from 'react';
import { DollarSign, Clock, Zap, Truck, Package, Route, AlertTriangle, CheckCircle, TrendingDown, TrendingUp } from 'lucide-react';

const RouteComparison = ({ routes, onSelect, orderData }) => {
  const [selectedRoute, setSelectedRoute] = useState(null);

  const handleSelectRoute = (route) => {
    setSelectedRoute(route);
  };

  const handleConfirm = () => {
    if (selectedRoute) {
      onSelect(selectedRoute);
    }
  };

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString()}`;
  };

  const getRouteIcon = (type) => {
    switch (type) {
      case 'Cost Effective':
        return DollarSign;
      case 'Time Effective':
        return Clock;
      case 'Hybrid':
        return Zap;
      default:
        return Route;
    }
  };

  const getRouteColor = (type) => {
    switch (type) {
      case 'Cost Effective':
        return 'green';
      case 'Time Effective':
        return 'orange';
      case 'Hybrid':
        return 'purple';
      default:
        return 'gray';
    }
  };

  const getTruckTypeIcon = (truckType) => {
    return Truck;
  };

  if (!routes || routes.length === 0) {
    return (
      <div className="card text-center">
        <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Routes Available</h3>
        <p className="text-gray-600">Unable to find optimal routes for your shipment. Please try different parameters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Route Options Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {routes.map((route, index) => {
          const Icon = getRouteIcon(route.type);
          const color = getRouteColor(route.type);
          const isSelected = selectedRoute?.id === route.id;
          
          return (
            <div
              key={route.id}
              onClick={() => handleSelectRoute(route)}
              className={`route-option ${
                isSelected 
                  ? 'route-option-selected' 
                  : color === 'green' 
                    ? 'route-option-cost'
                    : color === 'orange'
                      ? 'route-option-time'
                      : 'route-option-hybrid'
              }`}
            >
              {/* Route Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg bg-${color}-100`}>
                    <Icon className={`h-6 w-6 text-${color}-600`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{route.type}</h3>
                    <p className="text-sm text-gray-600">{route.description}</p>
                  </div>
                </div>
                {route.recommended && (
                  <div className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                    Recommended
                  </div>
                )}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center">
                  <div className={`text-2xl font-bold text-${color}-600`}>
                    {formatCurrency(route.totalCost)}
                  </div>
                  <div className="text-sm text-gray-600">Total Cost</div>
                  {route.savings && (
                    <div className="flex items-center justify-center mt-1">
                      <TrendingDown className="h-3 w-3 text-green-500 mr-1" />
                      <span className="text-xs text-green-600">Save ${route.savings}</span>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold text-${color}-600`}>
                    {route.totalTime}h
                  </div>
                  <div className="text-sm text-gray-600">Transit Time</div>
                  {route.timeReduction && (
                    <div className="flex items-center justify-center mt-1">
                      <TrendingDown className="h-3 w-3 text-blue-500 mr-1" />
                      <span className="text-xs text-blue-600">{route.timeReduction}h faster</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Truck Configuration */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Truck Configuration</span>
                </div>
                {route.trucks.map((truck, truckIndex) => (
                  <div key={truckIndex} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Truck className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">{truck.type}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">{truck.pallets} pallets</div>
                        <div className="text-xs text-gray-600">{formatCurrency(truck.cost)}</div>
                      </div>
                    </div>
                    {truck.utilization && (
                      <div className="mt-2">
                        <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                          <span>Utilization</span>
                          <span>{truck.utilization}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`bg-${color}-500 h-1.5 rounded-full`}
                            style={{ width: `${truck.utilization}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Route Details */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Distance</span>
                  <span className="font-medium">{route.distance} km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Fuel Cost</span>
                  <span className="font-medium">{formatCurrency(route.fuelCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Peak Hour Impact</span>
                  <span className={`font-medium ${route.peakHourImpact > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {route.peakHourImpact > 0 ? `+${route.peakHourImpact}h` : 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Window</span>
                  <span className="font-medium">{route.deliveryWindow}</span>
                </div>
              </div>

              {/* Peak Hours Warning */}
              {route.peakHourImpact > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-orange-900">Peak Hours Impact</div>
                      <div className="text-xs text-orange-700">
                        Route includes travel during peak traffic periods
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Environmental Impact */}
              {route.environmentalScore && (
                <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                  <span>Environmental Score</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      route.environmentalScore >= 8 ? 'bg-green-500' :
                      route.environmentalScore >= 6 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span className="font-medium">{route.environmentalScore}/10</span>
                  </div>
                </div>
              )}

              {/* Select Button */}
              <button
                onClick={() => handleSelectRoute(route)}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : `bg-${color}-100 text-${color}-700 hover:bg-${color}-200`
                }`}
              >
                {isSelected ? 'Selected' : 'Select This Route'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selection Summary */}
      {selectedRoute && (
        <div className="card border-blue-200 bg-blue-50">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-blue-900 mb-2">
                Selected Route: {selectedRoute.type}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">
                    {formatCurrency(selectedRoute.totalCost)}
                  </div>
                  <div className="text-sm text-blue-700">Total Cost</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">
                    {selectedRoute.totalTime}h
                  </div>
                  <div className="text-sm text-blue-700">Transit Time</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">
                    {selectedRoute.trucks.length}
                  </div>
                  <div className="text-sm text-blue-700">Trucks Required</div>
                </div>
              </div>
              
              {/* Confirmation Details */}
              <div className="bg-white rounded-lg p-4 mb-4">
                <h5 className="font-medium text-gray-900 mb-3">Route Summary</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Route</span>
                    <span className="font-medium">{orderData.source} → {orderData.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distance</span>
                    <span className="font-medium">{selectedRoute.distance} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pallets</span>
                    <span className="font-medium">{orderData.palletCount} pallets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pickup Date</span>
                    <span className="font-medium">{orderData.pickupDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Delivery</span>
                    <span className="font-medium">{orderData.deliveryDate}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                className="btn-primary w-full sm:w-auto text-lg px-8 py-3"
              >
                Confirm Selected Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      <div className="card">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Detailed Comparison</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transit Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trucks Required
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost per Pallet
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {routes.map((route, index) => (
                <tr key={route.id} className={selectedRoute?.id === route.id ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-lg bg-${getRouteColor(route.type)}-100 mr-3`}>
                        <div className={`h-4 w-4 text-${getRouteColor(route.type)}-600`}>
                          {React.createElement(getRouteIcon(route.type))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{route.type}</div>
                        {route.recommended && (
                          <div className="text-xs text-blue-600">Recommended</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(route.totalCost)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {route.totalTime} hours
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {route.trucks.length}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(Math.round(route.totalCost / parseInt(orderData.palletCount)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RouteComparison;