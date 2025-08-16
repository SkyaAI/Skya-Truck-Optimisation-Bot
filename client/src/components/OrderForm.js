import React, { useState } from 'react';
import { Package, MapPin, Clock, Ruler, Calendar, AlertCircle } from 'lucide-react';

const AUSTRALIAN_CITIES = [
  'Sydney, NSW',
  'Melbourne, VIC',
  'Brisbane, QLD',
  'Perth, WA',
  'Adelaide, SA',
  'Gold Coast, QLD',
  'Newcastle, NSW',
  'Canberra, ACT',
  'Central Coast, NSW',
  'Wollongong, NSW',
  'Logan City, QLD',
  'Geelong, VIC',
  'Hobart, TAS',
  'Townsville, QLD',
  'Cairns, QLD',
  'Darwin, NT',
  'Ballarat, VIC',
  'Bendigo, VIC',
  'Albury, NSW',
  'Launceston, TAS'
];

const PALLET_SIZES = [
  { label: 'Standard (1200x1200x1200mm)', value: '1200x1200x1200', weight: 1000 },
  { label: 'Euro (1200x800x1200mm)', value: '1200x800x1200', weight: 800 },
  { label: 'Half (600x1200x1200mm)', value: '600x1200x1200', weight: 500 },
  { label: 'Custom', value: 'custom', weight: 0 }
];

const OrderForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    source: '',
    destination: '',
    palletCount: '',
    palletSize: '1200x1200x1200',
    customDimensions: { length: '', width: '', height: '', weight: '' },
    pickupDate: '',
    pickupTime: '',
    deliveryDate: '',
    deliveryTime: '',
    urgency: 'standard',
    specialRequirements: ''
  });

  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleCustomDimensionChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      customDimensions: {
        ...prev.customDimensions,
        [name]: value
      }
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.source) newErrors.source = 'Source location is required';
    if (!formData.destination) newErrors.destination = 'Destination is required';
    if (formData.source === formData.destination) newErrors.destination = 'Source and destination must be different';
    if (!formData.palletCount || formData.palletCount < 1) newErrors.palletCount = 'Number of pallets is required';
    if (!formData.pickupDate) newErrors.pickupDate = 'Pickup date is required';
    if (!formData.deliveryDate) newErrors.deliveryDate = 'Delivery date is required';
    
    // Validate pickup date is not in the past
    const today = new Date().toISOString().split('T')[0];
    if (formData.pickupDate < today) {
      newErrors.pickupDate = 'Pickup date cannot be in the past';
    }
    
    // Validate delivery date is after pickup date
    if (formData.pickupDate && formData.deliveryDate && formData.deliveryDate <= formData.pickupDate) {
      newErrors.deliveryDate = 'Delivery date must be after pickup date';
    }

    // Validate custom dimensions if selected
    if (formData.palletSize === 'custom') {
      const { length, width, height, weight } = formData.customDimensions;
      if (!length || !width || !height || !weight) {
        newErrors.customDimensions = 'All custom dimensions are required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-4xl mx-auto space-y-8">
      {/* Route Information */}
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <MapPin className="h-6 w-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Route Information</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Location *
            </label>
            <select
              name="source"
              value={formData.source}
              onChange={handleInputChange}
              className={`form-select ${errors.source ? 'border-red-500' : ''}`}
            >
              <option value="">Select pickup location</option>
              {AUSTRALIAN_CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            {errors.source && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.source}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destination *
            </label>
            <select
              name="destination"
              value={formData.destination}
              onChange={handleInputChange}
              className={`form-select ${errors.destination ? 'border-red-500' : ''}`}
            >
              <option value="">Select delivery location</option>
              {AUSTRALIAN_CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            {errors.destination && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.destination}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pallet Information */}
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Package className="h-6 w-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Pallet Details</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Pallets *
            </label>
            <input
              type="number"
              name="palletCount"
              value={formData.palletCount}
              onChange={handleInputChange}
              min="1"
              max="100"
              className={`form-input ${errors.palletCount ? 'border-red-500' : ''}`}
              placeholder="Enter number of pallets"
            />
            {errors.palletCount && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.palletCount}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pallet Size *
            </label>
            <select
              name="palletSize"
              value={formData.palletSize}
              onChange={handleInputChange}
              className="form-select"
            >
              {PALLET_SIZES.map(size => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Dimensions */}
        {formData.palletSize === 'custom' && (
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex items-center space-x-2 mb-4">
              <Ruler className="h-5 w-5 text-gray-600" />
              <h4 className="text-lg font-medium text-gray-900">Custom Dimensions</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm)</label>
                <input
                  type="number"
                  name="length"
                  value={formData.customDimensions.length}
                  onChange={handleCustomDimensionChange}
                  className="form-input"
                  placeholder="1200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (mm)</label>
                <input
                  type="number"
                  name="width"
                  value={formData.customDimensions.width}
                  onChange={handleCustomDimensionChange}
                  className="form-input"
                  placeholder="1200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (mm)</label>
                <input
                  type="number"
                  name="height"
                  value={formData.customDimensions.height}
                  onChange={handleCustomDimensionChange}
                  className="form-input"
                  placeholder="1200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  name="weight"
                  value={formData.customDimensions.weight}
                  onChange={handleCustomDimensionChange}
                  className="form-input"
                  placeholder="1000"
                />
              </div>
            </div>
            {errors.customDimensions && (
              <p className="mt-2 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.customDimensions}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timing Information */}
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Clock className="h-6 w-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Timing Requirements</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pickup Date *
              </label>
              <input
                type="date"
                name="pickupDate"
                value={formData.pickupDate}
                onChange={handleInputChange}
                min={getTomorrowDate()}
                className={`form-input ${errors.pickupDate ? 'border-red-500' : ''}`}
              />
              {errors.pickupDate && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.pickupDate}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Pickup Time
              </label>
              <select
                name="pickupTime"
                value={formData.pickupTime}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="">Any time</option>
                <option value="early-morning">Early Morning (6:00-8:00 AM)</option>
                <option value="morning">Morning (8:00-12:00 PM)</option>
                <option value="afternoon">Afternoon (12:00-5:00 PM)</option>
                <option value="evening">Evening (5:00-8:00 PM)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Delivery Date *
              </label>
              <input
                type="date"
                name="deliveryDate"
                value={formData.deliveryDate}
                onChange={handleInputChange}
                min={formData.pickupDate || getTomorrowDate()}
                className={`form-input ${errors.deliveryDate ? 'border-red-500' : ''}`}
              />
              {errors.deliveryDate && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.deliveryDate}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Delivery Time
              </label>
              <select
                name="deliveryTime"
                value={formData.deliveryTime}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="">Any time</option>
                <option value="early-morning">Early Morning (6:00-8:00 AM)</option>
                <option value="morning">Morning (8:00-12:00 PM)</option>
                <option value="afternoon">Afternoon (12:00-5:00 PM)</option>
                <option value="evening">Evening (5:00-8:00 PM)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Priority and Special Requirements */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Urgency Level
            </label>
            <select
              name="urgency"
              value={formData.urgency}
              onChange={handleInputChange}
              className="form-select"
            >
              <option value="standard">Standard (2-3 days)</option>
              <option value="express">Express (1-2 days)</option>
              <option value="urgent">Urgent (Same day/Next day)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Special Requirements
          </label>
          <textarea
            name="specialRequirements"
            value={formData.specialRequirements}
            onChange={handleInputChange}
            rows="3"
            className="form-input"
            placeholder="Any special handling requirements, access restrictions, or delivery instructions..."
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-6 border-t border-gray-200">
        <button
          type="submit"
          className="btn-primary w-full sm:w-auto text-lg px-8 py-3"
        >
          Find Optimal Routes
        </button>
      </div>
    </form>
  );
};

export default OrderForm;