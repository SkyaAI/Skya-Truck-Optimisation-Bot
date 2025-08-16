import React, { useState } from 'react';
import { Truck, Package, Clock, DollarSign, Route, AlertTriangle, CheckCircle } from 'lucide-react';
import OrderForm from './components/OrderForm';
import RouteOptimization from './components/RouteOptimization';
import RouteComparison from './components/RouteComparison';
import './App.css';

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [orderData, setOrderData] = useState(null);
  const [routeOptions, setRouteOptions] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOrderSubmit = async (data) => {
    setOrderData(data);
    setIsOptimizing(true);
    setCurrentStep(2);

    try {
      const response = await fetch('/api/optimize-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const routes = await response.json();
        setRouteOptions(routes);
        setCurrentStep(3);
      } else {
        console.error('Failed to optimize routes');
      }
    } catch (error) {
      console.error('Error optimizing routes:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleRouteSelection = (route) => {
    setSelectedRoute(route);
    setCurrentStep(4);
  };

  const handleNewOrder = () => {
    setCurrentStep(1);
    setOrderData(null);
    setRouteOptions(null);
    setSelectedRoute(null);
    setIsOptimizing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Truck className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Skya Truck Optimisation Bot</h1>
                <p className="text-sm text-gray-600">Smart freight consolidation and route planning</p>
              </div>
            </div>
            
            {/* Progress Steps */}
            <div className="hidden md:flex items-center space-x-4">
              {[
                { number: 1, title: 'Order Details', icon: Package },
                { number: 2, title: 'Optimizing', icon: Route },
                { number: 3, title: 'Route Options', icon: Clock },
                { number: 4, title: 'Confirmation', icon: CheckCircle }
              ].map(({ number, title, icon: Icon }) => (
                <div key={number} className="flex items-center space-x-2">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    currentStep >= number 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : 'border-gray-300 text-gray-400'
                  }`}>
                    {currentStep > number ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    currentStep >= number ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    {title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Create New Freight Order</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Enter your shipment details and let our AI find the most cost-effective and time-efficient routes for your freight.
              </p>
            </div>
            <OrderForm onSubmit={handleOrderSubmit} />
          </div>
        )}

        {currentStep === 2 && (
          <RouteOptimization 
            orderData={orderData}
            isOptimizing={isOptimizing}
          />
        )}

        {currentStep === 3 && routeOptions && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Route Recommendations</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Choose the best option for your freight needs based on cost, time, or hybrid optimization.
              </p>
            </div>
            <RouteComparison 
              routes={routeOptions}
              onSelect={handleRouteSelection}
              orderData={orderData}
            />
          </div>
        )}

        {currentStep === 4 && selectedRoute && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Route Confirmed!</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
                Your optimal route has been selected and is ready for implementation.
              </p>
            </div>

            <div className="card max-w-4xl mx-auto">
              <div className="border-l-4 border-green-500 pl-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Selected Route: {selectedRoute.type}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">${selectedRoute.totalCost.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Total Cost</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{selectedRoute.totalTime} hrs</div>
                    <div className="text-sm text-gray-600">Transit Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{selectedRoute.trucks.length}</div>
                    <div className="text-sm text-gray-600">Trucks Required</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={handleNewOrder}
                  className="btn-primary w-full sm:w-auto"
                >
                  Create New Order
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-600">
            © 2024 Skya Logistics. Powered by advanced route optimization algorithms.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;