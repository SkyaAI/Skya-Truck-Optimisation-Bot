import React, { useState, useEffect } from 'react';
import { Truck, Route, Calculator, Clock, DollarSign, Zap } from 'lucide-react';

const RouteOptimization = ({ orderData, isOptimizing }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  const optimizationSteps = [
    {
      icon: Route,
      title: 'Calculating Distance',
      description: 'Computing optimal routes between pickup and delivery locations',
      duration: 2000
    },
    {
      icon: Truck,
      title: 'Analyzing Truck Options',
      description: 'Evaluating B-Double, Semi-Trailer, and Medium Rigid configurations',
      duration: 3000
    },
    {
      icon: Calculator,
      title: 'Cost Optimization',
      description: 'Calculating fuel costs, distance charges, and operational expenses',
      duration: 2500
    },
    {
      icon: Clock,
      title: 'Time Analysis',
      description: 'Considering peak hours, traffic patterns, and delivery windows',
      duration: 2000
    },
    {
      icon: Zap,
      title: 'Finalizing Routes',
      description: 'Generating cost-effective, time-effective, and hybrid recommendations',
      duration: 1500
    }
  ];

  useEffect(() => {
    if (!isOptimizing) return;

    let stepIndex = 0;
    let progressTimer;
    
    const advanceStep = () => {
      if (stepIndex < optimizationSteps.length) {
        setCurrentStep(stepIndex);
        
        // Animate progress for current step
        let stepProgress = 0;
        const stepDuration = optimizationSteps[stepIndex].duration;
        const progressInterval = stepDuration / 100;
        
        progressTimer = setInterval(() => {
          stepProgress += 1;
          setProgress((stepIndex * 100 + stepProgress) / optimizationSteps.length);
          
          if (stepProgress >= 100) {
            clearInterval(progressTimer);
            stepIndex++;
            if (stepIndex < optimizationSteps.length) {
              setTimeout(advanceStep, 200);
            }
          }
        }, progressInterval);
      }
    };

    advanceStep();

    return () => {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
    };
  }, [isOptimizing]);

  if (!orderData) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Order Summary */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Processing Your Order</h2>
        <div className="bg-blue-50 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-900">{orderData.source}</div>
              <div className="text-sm text-blue-600">Pickup Location</div>
            </div>
            <div className="flex justify-center items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-0.5 bg-blue-400"></div>
                <Truck className="h-6 w-6 text-blue-600" />
                <div className="w-8 h-0.5 bg-blue-400"></div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-900">{orderData.destination}</div>
              <div className="text-sm text-blue-600">Delivery Location</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              {orderData.palletCount} pallets • {orderData.urgency} priority
            </span>
          </div>
        </div>
      </div>

      {/* Optimization Progress */}
      <div className="card">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Route Optimization Progress</h3>
            <div className="text-sm text-gray-600">{Math.round(progress)}% Complete</div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Optimization Steps */}
        <div className="space-y-6">
          {optimizationSteps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            const isUpcoming = index > currentStep;

            return (
              <div 
                key={index}
                className={`flex items-start space-x-4 p-4 rounded-lg transition-all duration-300 ${
                  isActive ? 'bg-blue-50 border-l-4 border-blue-500' : 
                  isCompleted ? 'bg-green-50 border-l-4 border-green-500' : 
                  'bg-gray-50'
                }`}
              >
                <div className={`p-2 rounded-lg ${
                  isActive ? 'bg-blue-500 text-white animate-pulse' :
                  isCompleted ? 'bg-green-500 text-white' :
                  'bg-gray-300 text-gray-600'
                }`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'loading-spinner' : ''}`} />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className={`font-medium ${
                      isActive ? 'text-blue-900' :
                      isCompleted ? 'text-green-900' :
                      'text-gray-700'
                    }`}>
                      {step.title}
                    </h4>
                    {isActive && (
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    )}
                    {isCompleted && (
                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${
                    isActive ? 'text-blue-700' :
                    isCompleted ? 'text-green-700' :
                    'text-gray-600'
                  }`}>
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Processing Indicator */}
        {isOptimizing && (
          <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
            <div className="flex items-center space-x-3">
              <div className="flex space-x-1">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
              <div>
                <div className="font-medium text-gray-900">AI Engine Processing</div>
                <div className="text-sm text-gray-600">Analyzing thousands of route combinations for optimal results</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Peak Hours Warning */}
      <div className="card border-orange-200 bg-orange-50">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Clock className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-medium text-orange-900">Peak Hours Consideration</h4>
            <p className="text-sm text-orange-700 mt-1">
              Our algorithm automatically adjusts for Australian peak traffic periods:
              <br />
              <strong>7:30-10:00 AM</strong> • <strong>2:30-4:00 PM</strong> • <strong>5:00-7:00 PM</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteOptimization;