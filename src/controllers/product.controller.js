import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import { Product } from "../models/product.model.js";
import mongoose from "mongoose";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import crypto from 'crypto'
import { Catagory } from "../models/catagory.model.js";

function generateUniqueId() {
  return crypto.randomBytes(16).toString('hex');
}

const addProduct = asyncHandler(async (req, res) => { 

    const { catagory, variant, boxSize, allIndiaDelivery, storage, allergens, ingredients, size } = req.body;
    console.log(catagory, variant, boxSize, allIndiaDelivery)
    
    try {
        if (!catagory || !variant || !boxSize) {
            throw new ApiError(400, 'All fields are required.');
          }

          const checkIfProductAlreadyExist = await Product.findOne({
            $and: [{variant}, {catagory}]
          })

          if(checkIfProductAlreadyExist) {
            throw new ApiError(409, "Product Already Exist")
          }
         
          // console.log(req.files)
      await Promise.all(variant.map(async (item, index) => {
        const pic1_url = await uploadOnCloudinary(req.files?.variantPic_1[index]?.path);
        const pic2_url = await uploadOnCloudinary(req.files?.variantPic_2[index]?.path);
        const pic3_url = await uploadOnCloudinary(req.files?.variantPic_3[index]?.path);
        const pic4_url = await uploadOnCloudinary(req.files?.variantPic_4[index]?.path) || "";


        // console.log(pic1_url.url)
        // Assign the URLs to the variant's properties
        variant[index].variantPic_1 = pic1_url?.url
        variant[index].variantPic_2 = pic2_url?.url
        variant[index].variantPic_3 = pic3_url?.url
        variant[index].variantPic_4 = pic4_url?.url
    }));

          const product = await Product.create({
            catagory: new mongoose.Types.ObjectId(catagory),
            variant,
            boxSize,
            allIndiaDelivery,
            storage: storage || "",
            allergens: allergens || "",
            ingredients: ingredients || "",
            size: size || "",
          });
    
          if(!product) {
            throw new ApiError(500, "Failed To Upload Product")
          }
        
        return  res.status(201).json(new ApiResponse(201, product,'Product created successfully'));
    } catch (error) {
        throw new ApiError(error.code, error.message)
    }
})

const deleteProduct = asyncHandler(async (req, res) => {

    const { productId } = req.query

    console.log(productId)
    const deletedProduct = await Product.findByIdAndDelete(new mongoose.Types.ObjectId(productId))

    if(!deletedProduct) {
        throw new ApiError(500, "Failed To Delete Product")
    }

    return res
    .status(200)
    .json(
        new ApiError(200, {}, "Product Deleted Successfully")
    )
})

const getProduct = asyncHandler(async (req, res) => {

  const { productName } = req.body
  const regex = new RegExp(productName, 'i');
  console.log(regex)
  const product = await Product.aggregate([

    {
      $match:{
        $or: [
            { productName: { $regex: regex } },
            { productDesc: { $regex: regex } },
            {
              varient: {
                  $elemMatch: {
                      $or: [
                          { variantName: { $regex: regex } },
                          { variantDesc: { $regex: regex } }
                      ]
                  }
              }
            }
        ]
      }
    }
  ])

  return res
  .status(200)
  .json(
    new ApiResponse(200, product, `${productName} Fetched Successfully`)
  )
})

const getAllProducts = asyncHandler(async (req, res) => {

  const page = parseInt(req.body.page) || 1;
  const limit = parseInt(req.body.limit) || 10;
  
  const results = await Product.aggregate([
    {
      $match: {}
    },
    // {
    //   $lookup: {
    //     from: 'Catagory',
    //     localField: 'catagory',
    //     foreignField: '_id',
    //     as: 'catagoryResult'
    //   }
    // },
    // {
    //   $unwind: '$catagoryResult' // Unwind to get a single document instead of an array if needed
    // },
    {
      $facet: {
        products: [
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ],
        totalProducts: [
          { $count: "count" }
        ]
      }
    }
  ]);
  const allProducts = results[0].products;
  const totalProducts = results[0].totalProducts[0]?.count || 0;
  const totalPages = Math.ceil(totalProducts / limit);
  
  return res.status(200).json(
    new ApiResponse(200, {
      products: allProducts,
      currentPage: page,
      totalPages: totalPages,
      totalProducts: totalProducts
    }, 'All Products Fetched Successfully')
  );
  
}
)

const filterProduct = asyncHandler(async (req, res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { productName, catagory, priceRange, foodType } = req.query;
  console.log(productName, catagory, priceRange, foodType)
  
  const pipeline = [];

  try {
    if(productName) {
      const regex = new RegExp(productName, 'i');
      pipeline.push({
        $match:{
                variant: {
                    $elemMatch: {
                        $or: [
                            { variantName: { $regex: regex } },
                            { variantDesc: { $regex: regex } }
                        ]
                    }
                }
            }
      })
    }
   
    if (catagory) {
      pipeline.push({
        $match: { 
          catagory: new mongoose.Types.ObjectId(catagory),
        }
      });
    }
    
    if (priceRange) {
      const [minPrice, maxPrice] = priceRange.split('-').map(Number);
      pipeline.push({
        $match: {
          variant: {
            $elemMatch: {
              variantPrice: { $gte: minPrice, $lte: maxPrice }
            }
          }
        }
      });
    }
    
    if (foodType) {
      pipeline.push({
        $match: {
          variant: { 
            $elemMatch: { 
              foodType: foodType 
            } 
          }
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'catagories',
          localField: 'catagory',
          foreignField: '_id',
          as: 'catagoryResult'
        }
      },
    );
    
    pipeline.push({
      $facet: {
        products: [
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ],
        totalProducts: [
          { $count: "count" }
        ]
      },
    })

    const results = await Product.aggregate(pipeline);
    console.log(pipeline)
    const allProducts = results[0].products;
    const totalProducts = results[0].totalProducts[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);
  
    return res.status(200).json(
      new ApiResponse(200, {
        products: allProducts,
        currentPage: page,
        totalPages: totalPages,
        totalProducts: totalProducts
      }, 'All Products Fetched Successfully')
    );
  } catch (error) {
    throw new ApiError(500, "Internal Server Error")
  }
 
});

const getCatagories = asyncHandler(async (req, res) => {
  // console.log("Inside Get Catagories");

  const catagories = await Catagory.aggregate([
    {
      $match: {}
    }
  ]);

  if (catagories.length === 0) {
    return res.status(200).json(new ApiResponse(201, false, "No Product Catagory Exist"));
  }
  
  // console.log(catagories);
  return res.status(201).json(new ApiResponse(201, catagories, "Catagories Fetched Successfully"));
});

// const editProduct = asyncHandler(async (req, res) => {
//   const { productId } = req.query;
//   const { catagory, variant, boxSize, allIndiaDelivery, storage, allergens, ingredients, size } = req.body;
//   console.log(variant)

//   const getProduct = await Product.findById(new mongoose.Types.ObjectId(productId));
//   if (!getProduct) {
//     throw new ApiError(404, "Product Not Found");
//   }

//   // Iterate over the variants to handle images
//   await Promise.all(variant.map(async (item, index) => {
//     // Check and update only if a new image is uploaded
//     if (req.files?.variantPic_1 && req.files.variantPic_1[index]) {
//       const pic1_url = await uploadOnCloudinary(req.files.variantPic_1[index].path);
//       variant[index].variantPic_1 = pic1_url?.url;
//     } else {
//       // Retain existing image link if not updated
//       variant[index].variantPic_1 = item.variantPic_1;
//     }

//     if (req.files?.variantPic_2 && req.files.variantPic_2[index]) {
//       const pic2_url = await uploadOnCloudinary(req.files.variantPic_2[index].path);
//       variant[index].variantPic_2 = pic2_url?.url;
//     } else {
//       variant[index].variantPic_2 = item.variantPic_2;
//     }

//     if (req.files?.variantPic_3 && req.files.variantPic_3[index]) {
//       const pic3_url = await uploadOnCloudinary(req.files.variantPic_3[index].path);
//       variant[index].variantPic_3 = pic3_url?.url;
//     } else {
//       variant[index].variantPic_3 = item.variantPic_3;
//     }

//     if (req.files?.variantPic_4 && req.files.variantPic_4[index]) {
//       const pic4_url = await uploadOnCloudinary(req.files.variantPic_4[index].path);
//       variant[index].variantPic_4 = pic4_url?.url;
//     } else {
//       variant[index].variantPic_4 = item.variantPic_4;
//     }
//   }));

//   // Update the product with new data
//   getProduct.catagory = (getProduct.catagory !== catagory) ? catagory : getProduct.catagory;
//   getProduct.variant = variant || getProduct.variant;
//   getProduct.boxSize = boxSize || getProduct.boxSize;
//   getProduct.allIndiaDelivery = (getProduct.allIndiaDelivery !== allIndiaDelivery) ? allIndiaDelivery : getProduct.allIndiaDelivery;
//   // Save the updated product
//   await getProduct.save({ validateBeforeSave: false });

//   res.status(200).json({ message: "Product updated successfully", product: getProduct });
// });

const editProduct = asyncHandler(async (req, res) => {
  const { productId } = req.query;
  const { catagory, variant, boxSize, allIndiaDelivery, storage, allergens, ingredients, size } = req.body;

  // console.log(storage, allergens, ingredients, size);

  const getProduct = await Product.findById(new mongoose.Types.ObjectId(productId));
  if (!getProduct) {
    throw new ApiError(404, "Product Not Found");
  }

  await Promise.all(variant.map(async (item, index) => {
    // Check for and upload variantPic_1
    const pic1Field = `variantPic_1_[${index}]`;
    if (req.files?.[pic1Field]?.length > 0) {
      const pic1_url = await uploadOnCloudinary(req.files[pic1Field][0].path);
      item.variantPic_1 = pic1_url?.url; // Set the new URL
    } else {
      item.variantPic_1 = getProduct.variant[index]?.variantPic_1 || item.variantPic_1; // Retain existing URL
    }

    // Check for and upload variantPic_2
    const pic2Field = `variantPic_2_[${index}]`;
    if (req.files?.[pic2Field]?.length > 0) {
      const pic2_url = await uploadOnCloudinary(req.files[pic2Field][0].path);
      item.variantPic_2 = pic2_url?.url;
    } else {
      item.variantPic_2 = getProduct.variant[index]?.variantPic_2 || item.variantPic_2;
    }

    // Check for and upload variantPic_3
    const pic3Field = `variantPic_3_[${index}]`;
    if (req.files?.[pic3Field]?.length > 0) {
      const pic3_url = await uploadOnCloudinary(req.files[pic3Field][0].path);
      item.variantPic_3 = pic3_url?.url;
    } else {
      item.variantPic_3 = getProduct.variant[index]?.variantPic_3 || item.variantPic_3;
    }

    // Check for and upload variantPic_4
    const pic4Field = `variantPic_4_[${index}]`;
    if (req.files?.[pic4Field]?.length > 0) {
      const pic4_url = await uploadOnCloudinary(req.files[pic4Field][0].path);
      item.variantPic_4 = pic4_url?.url;
    } else {
      item.variantPic_4 = getProduct.variant[index]?.variantPic_4 || item.variantPic_4;
    }
  }));


  // console.log(variant)
  // Update the product with new data
  getProduct.catagory = (getProduct.catagory !== catagory) ? catagory : getProduct.catagory;
  getProduct.variant = variant.length > 0 ? variant : getProduct.variant; // Only update if new variants are provided
  getProduct.boxSize = boxSize.length > 0 ? boxSize : getProduct.boxSize;
  getProduct.allIndiaDelivery = (getProduct.allIndiaDelivery !== allIndiaDelivery) ? allIndiaDelivery : getProduct.allIndiaDelivery;
  getProduct.storage = storage || getProduct.storage
  getProduct.allergens = allergens || getProduct.allergens
  getProduct.ingredients = ingredients || getProduct.ingredients
  getProduct.size = size || getProduct.size
  // Save the updated product
  await getProduct.save({ validateBeforeSave: false });

  res.status(200).json({ message: "Product updated successfully", product: getProduct });
});

const getSingleProduct = asyncHandler(async (req, res) => {

  const { productId } = req.query

  const product = await Product.findById(new mongoose.Types.ObjectId(productId))

  if(!product) {
    throw new ApiError(404, "Product Not Found")
  }

  return res.status(201).json(new ApiResponse(201, product, "Product Found Successfully"))
})



export {
    addProduct,
    deleteProduct,
    getProduct,
    getAllProducts,
    filterProduct,
    getCatagories,
    editProduct,
    getSingleProduct
}