/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: fullOrder object and order submission result
 * Filter: Validates order data exists
 * Transform: Formats order data into PDF structure
 * Store: N/A
 * Output: PDF buffer
 * Loop: Self-healing - handles missing fields gracefully
 */

let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (error) {
  console.warn('pdfkit module not installed. PDF generation will not be available.');
  PDFDocument = null;
}

/**
 * Generate formatted PDF for order
 * @param {Object} fullOrder - Full order object
 * @param {Object} orderResult - Order submission result from supplier
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateOrderPDF(fullOrder, orderResult = {}) {
  if (!PDFDocument) {
    throw new Error('pdfkit module is not installed. Please run: npm install pdfkit');
  }
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);
      
      // Header
      doc.fontSize(20).font('Helvetica-Bold')
        .text('ORDER CONFIRMATION', { align: 'center' });
      doc.moveDown(0.5);
      
      // Order Information
      doc.fontSize(12).font('Helvetica');
      const orderNumber = fullOrder.orderId || fullOrder.ticket || `ORD-${Date.now()}`;
      const supplier = (fullOrder.supplier || '').toUpperCase();
      const orderDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const status = orderResult.success ? 'SUBMITTED' : (fullOrder.orderStatus || 'DRAFT');
      
      doc.text(`Order Number: ${orderNumber}`, { continued: false });
      doc.text(`Supplier: ${supplier}`, { continued: false });
      doc.text(`Date: ${orderDate}`, { continued: false });
      doc.text(`Status: ${status}`, { continued: false });
      
      if (orderResult.confirmationNumber) {
        doc.text(`Confirmation Number: ${orderResult.confirmationNumber}`, { continued: false });
      }
      
      doc.moveDown(1);
      
      // Delivery Information
      if (fullOrder.delivery) {
        doc.fontSize(14).font('Helvetica-Bold').text('DELIVERY INFORMATION');
        doc.fontSize(10).font('Helvetica');
        
        const delivery = fullOrder.delivery;
        if (delivery.address_line_1 || delivery.address?.line1) {
          doc.text(`Address: ${delivery.address_line_1 || delivery.address?.line1 || ''}`);
        }
        if (delivery.address_line_2 || delivery.address?.line2) {
          doc.text(`Address 2: ${delivery.address_line_2 || delivery.address?.line2 || ''}`);
        }
        if (delivery.city || delivery.address?.city) {
          const city = delivery.city || delivery.address?.city || '';
          const state = delivery.state || delivery.address?.state || '';
          const zip = delivery.zip_code || delivery.address?.postalCode || delivery.address?.postal || '';
          doc.text(`City, State, ZIP: ${city}, ${state} ${zip}`.trim());
        }
        if (delivery.delivery_date?.formattedDate || delivery.date) {
          doc.text(`Delivery Date: ${delivery.delivery_date?.formattedDate || delivery.date || ''}`);
        }
        if (delivery.delivery_type || delivery.method) {
          doc.text(`Delivery Type: ${delivery.delivery_type || delivery.method || ''}`);
        }
        if (delivery.delivery_instructions || delivery.instructions || delivery.notes) {
          doc.text(`Instructions: ${delivery.delivery_instructions || delivery.instructions || delivery.notes || ''}`);
        }
        if (delivery.primary_contact || delivery.contact?.name) {
          doc.text(`Contact: ${delivery.primary_contact || delivery.contact?.name || ''}`);
        }
        
        doc.moveDown(1);
      }
      
      // Order Items
      const items = fullOrder.fullOrderItems || [];
      if (items.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('ORDER ITEMS');
        doc.moveDown(0.5);
        
        // Table header
        doc.fontSize(10).font('Helvetica-Bold');
        const tableTop = doc.y;
        doc.text('SKU', 50, tableTop);
        doc.text('Description', 150, tableTop, { width: 200 });
        doc.text('Qty', 360, tableTop, { width: 50, align: 'right' });
        doc.text('Price', 420, tableTop, { width: 70, align: 'right' });
        doc.text('Total', 500, tableTop, { width: 70, align: 'right' });
        
        // Table rows
        doc.font('Helvetica');
        let yPos = tableTop + 20;
        let orderTotal = 0;
        
        items.forEach((item, index) => {
          // Check if we need a new page
          if (yPos > 700) {
            doc.addPage();
            yPos = 50;
          }
          
          const sku = item.sku || item.itemNumber || item.productId || '';
          const description = item.title || item.name || item.description || item.productName || '';
          const qty = item.qty || item.quantity || 0;
          const price = item.price || item.unitPrice || 0;
          const lineTotal = qty * price;
          orderTotal += lineTotal;
          
          doc.fontSize(9).text(sku, 50, yPos);
          doc.text(description.substring(0, 40), 150, yPos, { width: 200 });
          doc.text(String(qty), 360, yPos, { width: 50, align: 'right' });
          doc.text(`$${price.toFixed(2)}`, 420, yPos, { width: 70, align: 'right' });
          doc.text(`$${lineTotal.toFixed(2)}`, 500, yPos, { width: 70, align: 'right' });
          
          yPos += 20;
        });
        
        // Order Total
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica-Bold');
        const totalY = doc.y;
        doc.text('ORDER TOTAL:', 400, totalY, { width: 100, align: 'right' });
        doc.text(`$${orderTotal.toFixed(2)}`, 500, totalY, { width: 70, align: 'right' });
      }
      
      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica');
      doc.text('This is an automated order confirmation.', { align: 'center' });
      if (orderResult.confirmationNumber) {
        doc.text(`Supplier Confirmation: ${orderResult.confirmationNumber}`, { align: 'center' });
      }
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateOrderPDF
};

