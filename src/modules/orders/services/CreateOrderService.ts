import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';
import Product from '@modules/products/infra/typeorm/entities/Product';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    // Check invalid customer
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('This customer does not exists.');
    }

    // Check invalid product
    const productList = await this.productsRepository.findAllById(products);
    if (productList.length !== products.length) {
      throw new AppError('There are some invalid product.');
    }

    // Check insufficient storage
    const productsToSubtractStorage: Product[] = [];
    productList.forEach(storageProduct => {
      products.find(cartProduct => {
        if (cartProduct.quantity > storageProduct.quantity) {
          throw new AppError('Insufficient quantity of this product.');
        }

        productsToSubtractStorage.push({
          ...storageProduct,
          quantity: storageProduct.quantity - cartProduct.quantity,
        });
        return false;
      });
    });

    // Create order with custom product id
    const customIdProductList = productList.map(product => {
      return { ...product, product_id: product.id };
    });

    // Subtract storage quantity
    const updatedProducts = await this.productsRepository.updateQuantity(
      productsToSubtractStorage,
    );

    let order = await this.ordersRepository.create({
      customer,
      products: customIdProductList,
    });

    const result = order.order_products.map(op_product => {
      const updatedProduct = productsToSubtractStorage.find(up_product => {
        return up_product.id === op_product.id;
      });

      if (updatedProduct) {
        return {
          ...op_product,
          quantity: op_product.quantity - updatedProduct.quantity,
        };
      }

      return op_product;
    });

    order = { ...order, order_products: result };

    return order;
  }
}

export default CreateOrderService;
